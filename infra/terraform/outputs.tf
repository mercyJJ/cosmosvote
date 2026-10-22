output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "s3_bucket" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (needed for cache invalidation)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cdn_price_class" {
  description = "CloudFront price class in use (controls which edge locations are active)"
  value       = aws_cloudfront_distribution.frontend.price_class
}

output "immutable_assets_cache_policy_id" {
  description = "CloudFront cache policy ID used for /assets/* (1-year immutable)"
  value       = aws_cloudfront_cache_policy.immutable_assets.id
}

output "no_cache_html_policy_id" {
  description = "CloudFront cache policy ID used for HTML (no-cache)"
  value       = aws_cloudfront_cache_policy.no_cache_html.id
}
