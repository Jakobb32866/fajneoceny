using BackendApi.Domain;
using Microsoft.AspNetCore.Identity;

namespace BackendApi;

/// <summary>
/// `dotnet run -- hash-password &lt;password&gt;` — prints a hash for
/// SuperAdmin:PasswordHash, so no plaintext credential ever has to be placed
/// in configuration, .env or docker-compose.
///
/// Uses the very same PasswordHasher the login path verifies with, so the
/// output is guaranteed to be accepted.
/// </summary>
public static class PasswordHashCommand
{
    public const string Verb = "hash-password";

    /// <summary>
    /// Runs the command if argv asks for it. Returns true when the process
    /// should exit without starting the web host.
    ///
    /// Matches ONLY an exact first argument: `dotnet run` passes everything
    /// after `--` straight through, and .claude/launch.json's
    /// backend-api-smoke entry uses that to pass config overrides such as
    /// --ConnectionStrings:DefaultConnection=... which must not be swallowed.
    /// </summary>
    public static bool TryRun(string[] args)
    {
        if (args.Length == 0 || args[0] != Verb) return false;

        if (args.Length < 2 || string.IsNullOrWhiteSpace(args[1]))
        {
            Console.Error.WriteLine($"usage: dotnet run -- {Verb} <password>");
            Environment.ExitCode = 1;
            return true;
        }

        // PasswordHasher salts internally, so the hash differs every run;
        // any of them verifies.
        var hash = new PasswordHasher<User>().HashPassword(new User(), args[1]);

        Console.WriteLine(hash);
        Console.Error.WriteLine();
        Console.Error.WriteLine("Set this as SuperAdmin__PasswordHash (with SuperAdmin__Email) in your .env");
        Console.Error.WriteLine("or docker-compose environment, then restart the API.");
        return true;
    }
}
