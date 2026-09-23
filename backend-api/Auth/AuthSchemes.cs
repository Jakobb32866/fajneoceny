namespace BackendApi.Auth;

/// <summary>
/// The two JWT bearer schemes. Each validates exactly ONE kind of token: its
/// own audience, signed with its own key and no other.
///
/// This is what actually makes the keys separate. A single scheme holding
/// both keys accepts a token signed by EITHER key for EITHER audience, and the
/// claims the policies check (fo_actor, fo_role) are chosen by whoever signs
/// the token — so the student key alone could mint a super-admin token. With
/// one scheme per token type, and every policy pinned to one scheme, a token
/// only authenticates where its key is trusted.
/// </summary>
public static class AuthSchemes
{
    public const string Student = "StudentBearer";
    public const string Admin = "AdminBearer";
}
