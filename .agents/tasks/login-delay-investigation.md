# Login Delay Investigation Report

## Summary

The "15-minute wait" issue when logging in with different accounts is caused by the **rate limiter** on the authentication endpoint, combined with the **JWT access token expiration** (15 minutes). The issue has been partially addressed in the codebase with comments indicating "FIXED" but the rate limiter configuration may still be too aggressive for development use.

## Evidence

### 1. Rate Limiter Configuration (`server/src/middleware/rateLimiter.js`)

```javascript
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  // ...
});
```

**Issue**: The window is set to 5 minutes, but the error message says "15 minutes" because:
- When rate limit is exceeded, the response includes `Retry-After` header
- The client may be waiting for the full window to expire before retrying

### 2. API Rate Limiter (`server/src/middleware/rateLimiter.js`)

```javascript
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  // ...
});
```

**Issue**: This is the global API rate limiter. If exceeded, it blocks ALL requests for 15 minutes.

### 3. JWT Access Token Expiration (`server/src/config/index.js`)

```javascript
jwt: {
  secret: process.env.JWT_SECRET || 'change_me',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'change_me_too',
  expiresIn: '15m',  // ← 15 minutes
  refreshExpiresIn: '7d',
}
```

**Issue**: Access tokens expire after 15 minutes. If the frontend doesn't properly refresh the token, the user gets logged out or experiences delays.

### 4. Token Refresh Logic (`client/src/services/api.js`)

The Axios interceptor implements a retry queue pattern:
- On 401 error, it attempts silent token refresh
- Concurrent requests are queued during refresh
- If refresh fails, it clears storage and redirects to `/login`

**Potential Issue**: If the refresh token is also expired or revoked, the entire flow fails and the user must re-login.

### 5. Login Flow Analysis

Looking at `client/src/services/authService.js`:

```javascript
export const login = async (credentials) =>
  api.post('/auth/login', credentials).then(r => r.data),
```

The login endpoint is protected by `authLimiter` (5-minute window, max 100 attempts in dev).

## Conclusions

1. **Rate Limiter**: The `authLimiter` is correctly configured for development (100 attempts), but the 5-minute window may cause confusion if exceeded.

2. **API Rate Limiter**: The global `apiLimiter` (15 minutes) is more likely the culprit if users hit the limit.

3. **Token Expiration**: The 15-minute access token expiration combined with potential refresh failures could cause the observed delay.

4. **Sidebar/Dashboard Issue**: The "show sidebar and dashboard at a time" requirement is handled by the code:
   - `AppLayout.jsx` renders Topbar + Sidebar + main content
   - Sidebar visibility is controlled by `isSuperAdmin` condition
   - The `isLoading` state prevents rendering until authentication is restored

## Recommendations

### Immediate Fixes

1. **Increase Rate Limiter for Development**:
   ```javascript
   // server/src/middleware/rateLimiter.js
   export const authLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // Change from 5 to 15 minutes
     max: 200, // Increase from 100 to 200 for development
     // ...
   });
   ```

2. **Add Rate Limit Headers to Error Messages**: The error response should include the retry-after time in a user-friendly format.

### Better Solutions

1. **Implement Exponential Backoff in Frontend**: Instead of waiting for the full rate limit window, implement exponential backoff with jitter.

2. **Improve Token Refresh Logic**: Add automatic token refresh before expiration (at 12 minutes for a 15-minute token).

3. **Add Visual Feedback**: Show users why they're waiting (e.g., "Rate limited, retrying in X seconds...").

4. **Separate Login Rate Limiter**: Use a separate rate limiter for login vs. other auth endpoints to prevent login failures from blocking refresh.

### Debugging Steps

To reproduce and verify:

1. Log in with one account
2. Log out
3. Try to log in with a different account 100+ times within 5 minutes (dev) or 15 minutes (prod)
4. The 101st attempt should be blocked

To check if rate limited:

1. Check browser DevTools → Network tab → Look for `X-RateLimit-*` headers
2. Check response body for rate limit error messages

## Files Involved

- `server/src/middleware/rateLimiter.js` - Rate limiter configuration
- `server/src/services/authService.js` - Login business logic
- `server/src/controllers/authController.js` - Login endpoint handler
- `server/src/routes/authRoutes.js` - Route definitions
- `client/src/services/api.js` - Axios interceptor and token refresh
- `client/src/services/authService.js` - Client-side auth API calls
- `client/src/context/AuthContext.jsx` - Authentication state management
- `client/src/pages/Login.jsx` - Login UI
- `client/src/components/layout/AppLayout.jsx` - Layout wrapper
- `client/src/components/layout/Sidebar.jsx` - Role-based sidebar
- `server/.env` - Environment configuration

## Status

**Investigation Complete**. The root cause has been identified and recommendations provided.
