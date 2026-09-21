namespace BackendApi.Services.Storage;

public class StorageOptions
{
    /// <summary>Directory (relative to the app's working directory, or absolute) where uploaded files are saved.</summary>
    public string RootPath { get; set; } = "storage";
}
