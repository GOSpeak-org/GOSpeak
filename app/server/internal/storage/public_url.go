package storage

import (
	"fmt"
	"strings"
)

// publicURL 按 provider 与配置拼接对象的公开访问 URL。
func publicURL(providerType, endpoint, bucket, publicBaseURL, key string) string {
	if base := strings.TrimRight(publicBaseURL, "/"); base != "" {
		return base + "/" + key
	}
	if providerType != "s3" {
		return "/uploads/" + key
	}
	ep := strings.TrimRight(endpoint, "/")
	if strings.HasSuffix(ep, ".amazonaws.com") {
		host := strings.TrimPrefix(strings.TrimPrefix(ep, "https://"), "http://")
		host = strings.TrimSuffix(host, ".amazonaws.com")
		parts := strings.Split(host, ".")
		region := ""
		if len(parts) >= 2 {
			region = parts[1]
		}
		return fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucket, region, key)
	}
	return fmt.Sprintf("%s/%s/%s", ep, bucket, key)
}
