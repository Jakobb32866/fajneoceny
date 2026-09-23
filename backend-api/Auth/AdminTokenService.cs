using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BackendApi.Domain;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace BackendApi.Auth;

/// <summary>
/// Issues the admin JWT. Separate from JwtTokenService in three ways that all
/// matter:
///
///  - a distinct audience, so an admin token is recognisable as such;
///  - a distinct signing key (Jwt:AdminKey), so the student-token secret
///    alone cannot forge an admin token;
///  - a much shorter lifetime — an admin session is a desk session, not a
///    30-day mobile one.
/// </summary>
public class AdminTokenService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _options = options.Value;

    public string IssueToken(Admin admin)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, admin.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, admin.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, admin.Email),

            // Marks this as an ADMIN token. The default authorization policy
            // requires the student value, so this token cannot reach a
            // student route.
            new Claim(AuthClaims.Actor, AuthClaims.ActorAdmin),

            // First-pass filter only; AdminContext re-reads the real role.
            new Claim(AuthClaims.Role, admin.Role.ToString()),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.EffectiveAdminKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: JwtOptions.AdminAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_options.AdminExpiryMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
