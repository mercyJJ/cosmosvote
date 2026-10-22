terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # ---------------------------------------------------------------------------
  # Remote state backend (S3 + DynamoDB locking)
  #
  # One-time bootstrap (run once per AWS account before `terraform init`):
  #   1. Create the state bucket:
  #        aws s3api create-bucket \
  #          --bucket cosmosvote-tfstate \
  #          --region us-east-1 \
  #          --create-bucket-configuration LocationConstraint=us-east-1
  #        aws s3api put-bucket-versioning \
  #          --bucket cosmosvote-tfstate \
  #          --versioning-configuration Status=Enabled
  #        aws s3api put-bucket-encryption \
  #          --bucket cosmosvote-tfstate \
  #          --server-side-encryption-configuration \
  #            '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  #        aws s3api put-public-access-block \
  #          --bucket cosmosvote-tfstate \
  #          --public-access-block-configuration \
  #            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  #   2. Create the DynamoDB lock table:
  #        aws dynamodb create-table \
  #          --table-name cosmosvote-tfstate-lock \
  #          --attribute-definitions AttributeName=LockID,AttributeType=S \
  #          --key-schema AttributeName=LockID,KeyType=HASH \
  #          --billing-mode PAY_PER_REQUEST \
  #          --region us-east-1
  #   3. Then run: terraform init
  #
  # Backend config is split per environment in infra/terraform/envs/:
  #   terraform init -backend-config="envs/staging.s3.tfbackend"
  #   terraform init -backend-config="envs/production.s3.tfbackend"
  # ---------------------------------------------------------------------------
  backend "s3" {
    bucket         = "cosmosvote-tfstate"
    key            = "cosmosvote/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "cosmosvote-tfstate-lock"
  }
}

provider "aws" {
  region = var.aws_region
}

# CloudFront requires ACM certs in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

data "archive_file" "csp_reporter" {
  type        = "zip"
  source_file = "${path.module}/csp_reporter.py"
  output_path = "${path.root}/.terraform/csp_reporter.zip"
}

locals {
  bucket_name = "cosmosvote-frontend-${var.environment}"
  origin_id   = "cosmosvote-s3-${var.environment}"
}

# ─── S3 bucket ────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket        = local.bucket_name
  force_destroy = var.environment != "production"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration { status = "Enabled" }
}

# ─── CloudFront OAC ───────────────────────────────────────────────────────────
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = local.origin_id
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_iam_role" "csp_reporter" {
  name = "cosmosvote-csp-reporter-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "csp_reporter" {
  name              = "/aws/lambda/cosmosvote-csp-reporter-${var.environment}"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "csp_reporter_logs" {
  name = "write-csp-report-logs"
  role = aws_iam_role.csp_reporter.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.csp_reporter.arn}:*"
    }]
  })
}

resource "aws_lambda_function" "csp_reporter" {
  function_name    = "cosmosvote-csp-reporter-${var.environment}"
  role             = aws_iam_role.csp_reporter.arn
  runtime          = "python3.12"
  handler          = "csp_reporter.handler"
  filename         = data.archive_file.csp_reporter.output_path
  source_code_hash = data.archive_file.csp_reporter.output_base64sha256
  timeout          = 5
  memory_size      = 128
  depends_on       = [aws_cloudwatch_log_group.csp_reporter, aws_iam_role_policy.csp_reporter_logs]
}

resource "aws_apigatewayv2_api" "csp_reports" {
  name          = "cosmosvote-csp-reports-${var.environment}"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "csp_reporter" {
  api_id                 = aws_apigatewayv2_api.csp_reports.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.csp_reporter.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "csp_reports" {
  api_id    = aws_apigatewayv2_api.csp_reports.id
  route_key = "POST /report"
  target    = "integrations/${aws_apigatewayv2_integration.csp_reporter.id}"
}

resource "aws_apigatewayv2_stage" "csp_reports" {
  api_id      = aws_apigatewayv2_api.csp_reports.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
}

resource "aws_lambda_permission" "csp_reporter" {
  statement_id  = "AllowCspReportApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.csp_reporter.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.csp_reports.execution_arn}/*/POST/report"
}

resource "aws_cloudfront_response_headers_policy" "frontend_security" {
  name = "cosmosvote-security-${var.environment}"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://soroban-testnet.stellar.org https://soroban-mainnet.stellar.org ${var.faucet_api_origin}; upgrade-insecure-requests; report-uri ${aws_apigatewayv2_api.csp_reports.api_endpoint}/report;"
      override                  = true
    }
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFront"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}

# ─── CloudFront cache policies ────────────────────────────────────────────────

# Immutable static assets (JS, CSS, fonts, images) — Vite content-addresses
# these files via a hash in the filename, so they can be cached for 1 year.
# Cache-Control: public, max-age=<var.immutable_assets_max_age>, immutable
resource "aws_cloudfront_cache_policy" "immutable_assets" {
  name        = "cosmosvote-immutable-assets-${var.environment}"
  comment     = "1-year cache for content-addressed static assets (${var.environment})"
  default_ttl = var.immutable_assets_max_age
  max_ttl     = var.immutable_assets_max_age
  min_ttl     = var.immutable_assets_max_age

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config  { cookie_behavior  = "none" }
    headers_config  { header_behavior  = "none" }
    query_strings_config { query_string_behavior = "none" }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# HTML entry-point — must never be served stale so new deployments take effect
# immediately. Cache-Control: no-cache, no-store, must-revalidate
resource "aws_cloudfront_cache_policy" "no_cache_html" {
  name        = "cosmosvote-no-cache-html-${var.environment}"
  comment     = "No-cache policy for index.html (${var.environment})"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config  { cookie_behavior  = "none" }
    headers_config  { header_behavior  = "none" }
    query_strings_config { query_string_behavior = "none" }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# ─── CloudFront distribution ──────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = var.cdn_price_class
  comment             = "CosmosVote frontend (${var.environment})"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # ── Ordered behaviour 1: content-addressed static assets ───────────────────
  # Vite emits all hashed assets into /assets/. These files get a 1-year
  # immutable cache and are Brotli/gzip compressed at the edge.
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.immutable_assets.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend_security.id
  }

  # ── Default behaviour: HTML shell + everything else ─────────────────────────
  # index.html is always served fresh (TTL 0) so new deployments propagate
  # instantly without requiring an explicit cache invalidation.
  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.no_cache_html.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend_security.id
  }

  # SPA fallback: return index.html for 403/404
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
