variable "aws_region" {
  description = "AWS region for S3 bucket"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment: staging or production"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "faucet_api_origin" {
  description = "HTTPS origin of the faucet API allowed by the frontend CSP"
  type        = string
  validation {
    condition     = can(regex("^https://[^/]+$", var.faucet_api_origin))
    error_message = "faucet_api_origin must be an HTTPS origin without a path."
  }
}

variable "cdn_price_class" {
  description = <<-EOT
    CloudFront price class controlling which edge locations serve the distribution.
    PriceClass_All     — all edge locations globally (lowest latency worldwide, higher cost).
    PriceClass_200     — North America, Europe, Asia, Middle East, Africa.
    PriceClass_100     — North America and Europe only (cheapest, higher latency elsewhere).
    Production should use PriceClass_All; staging can use PriceClass_100 to reduce cost.
  EOT
  type        = string
  default     = "PriceClass_All"
  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.cdn_price_class)
    error_message = "cdn_price_class must be PriceClass_All, PriceClass_200, or PriceClass_100."
  }
}

variable "immutable_assets_max_age" {
  description = <<-EOT
    max-age value (in seconds) for the Cache-Control header on immutable static assets
    (JS, CSS, fonts, images under /assets/*).
    Default: 31536000 (1 year). These files are content-addressed by Vite (filename
    includes a hash), so they can be cached indefinitely.
  EOT
  type        = number
  default     = 31536000
}
