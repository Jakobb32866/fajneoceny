using Microsoft.Extensions.Options;

namespace BackendApi.Services.Storage;

public interface IFileStorageService
{
    Task<string> SaveAsync(Stream content, string fileName);
}

public class FileStorageService : IFileStorageService
{
    private readonly string _rootPath;

    public FileStorageService(IOptions<StorageOptions> options)
    {
        _rootPath = options.Value.RootPath;
        Directory.CreateDirectory(_rootPath);
    }

    public async Task<string> SaveAsync(Stream content, string fileName)
    {
        var savedName = $"{Guid.NewGuid()}{Path.GetExtension(fileName)}";
        var fullPath = Path.Combine(_rootPath, savedName);

        await using var fileStream = File.Create(fullPath);
        await content.CopyToAsync(fileStream);

        return savedName;
    }
}
