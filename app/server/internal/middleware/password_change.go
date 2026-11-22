package middleware

import (
	"sync"
	"time"

	"GOSpeak/internal/pkg"

	"github.com/gin-gonic/gin"
)

// defaultPasswordCacheTTL 控制默认口令查询的缓存窗口。改密成功后会主动清除，
// 这里只防止高频请求把 DB + bcrypt 打爆。
const defaultPasswordCacheTTL = 10 * time.Second

var defaultPasswordCache = struct {
	sync.Mutex
	m map[string]struct {
		needsChange bool
		expires     time.Time
	}
}{m: make(map[string]struct {
	needsChange bool
	expires     time.Time
})}

// ClearDefaultPasswordCache 在管理员改密成功后调用，立即失效该用户的门禁缓存。
func ClearDefaultPasswordCache(userUUID string) {
	defaultPasswordCache.Lock()
	delete(defaultPasswordCache.m, userUUID)
	defaultPasswordCache.Unlock()
}

// DefaultPasswordNeedsChange 供 /ws 等非 Gin 通道查询默认口令状态。
// checker 未注入时返回 false（不拦），生产由 gin.go 注入。
func DefaultPasswordNeedsChange(userUUID string) (bool, error) {
	checker := currentAuth().deps.DefaultPasswordChecker
	if checker == nil {
		return false, nil
	}
	return checker(userUUID)
}

// RequirePasswordChanged 强制仍使用默认口令的管理员先改密。
// 只拦 role=admin；checker 未注入时不拦（兼容嵌入/测试，生产由 gin.go 注入）。
func RequirePasswordChanged() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := CurrentUser(c)
		if claims == nil || claims.Role != "admin" || claims.UserUUID == "" {
			c.Next()
			return
		}
		checker := currentAuth().deps.DefaultPasswordChecker
		if checker == nil {
			c.Next()
			return
		}

		uuid := claims.UserUUID
		now := time.Now()
		defaultPasswordCache.Lock()
		entry, ok := defaultPasswordCache.m[uuid]
		if ok && now.Before(entry.expires) {
			defaultPasswordCache.Unlock()
			if entry.needsChange {
				rejectDefaultPassword(c)
				return
			}
			c.Next()
			return
		}
		defaultPasswordCache.Unlock()

		needsChange, err := checker(uuid)
		if err != nil {
			// fail-closed：查询失败时拒绝，避免默认口令会话在故障窗口内放行。
			pkg.Fail(c, pkg.INTERNAL_ERROR, "password status check failed")
			c.Abort()
			return
		}
		defaultPasswordCache.Lock()
		defaultPasswordCache.m[uuid] = struct {
			needsChange bool
			expires     time.Time
		}{needsChange: needsChange, expires: now.Add(defaultPasswordCacheTTL)}
		defaultPasswordCache.Unlock()

		if needsChange {
			rejectDefaultPassword(c)
			return
		}
		c.Next()
	}
}

func rejectDefaultPassword(c *gin.Context) {
	c.Header("X-Gospeak-Password-Change-Required", "1")
	pkg.Fail(c, pkg.FORBIDDEN, "must change default password first")
	c.Abort()
}
