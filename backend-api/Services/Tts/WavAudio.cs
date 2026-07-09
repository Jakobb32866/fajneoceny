namespace BackendApi.Services.Tts;

public record WavFormat(short Channels, int SampleRate, short BitsPerSample);

/// <summary>
/// Minimal RIFF/WAVE reader-writer, just enough to splice PCM clips
/// (TTS output + generated silence) together into one file without pulling
/// in an audio library or shelling out to ffmpeg.
/// </summary>
public static class WavAudio
{
    public static (WavFormat Format, byte[] Pcm) Parse(byte[] wav)
    {
        using var stream = new MemoryStream(wav);
        using var reader = new BinaryReader(stream);

        if (new string(reader.ReadChars(4)) != "RIFF") throw new InvalidDataException("Not a RIFF file");
        reader.ReadInt32(); // chunk size
        if (new string(reader.ReadChars(4)) != "WAVE") throw new InvalidDataException("Not a WAVE file");

        short channels = 0, bitsPerSample = 0;
        int sampleRate = 0;
        byte[]? pcm = null;

        while (stream.Position < stream.Length)
        {
            var chunkId = new string(reader.ReadChars(4));
            var chunkSize = reader.ReadInt32();

            if (chunkId == "fmt ")
            {
                reader.ReadInt16(); // audio format
                channels = reader.ReadInt16();
                sampleRate = reader.ReadInt32();
                reader.ReadInt32(); // byte rate
                reader.ReadInt16(); // block align
                bitsPerSample = reader.ReadInt16();
                var extra = chunkSize - 16;
                if (extra > 0) reader.ReadBytes(extra);
            }
            else if (chunkId == "data")
            {
                pcm = reader.ReadBytes(chunkSize);
            }
            else
            {
                reader.ReadBytes(chunkSize);
            }

            if (chunkSize % 2 != 0 && stream.Position < stream.Length) reader.ReadByte(); // padding
        }

        if (pcm is null) throw new InvalidDataException("WAV file has no data chunk");
        return (new WavFormat(channels, sampleRate, bitsPerSample), pcm);
    }

    public static byte[] Silence(WavFormat format, TimeSpan duration)
    {
        var bytesPerSample = format.BitsPerSample / 8;
        var frameCount = (int)(duration.TotalSeconds * format.SampleRate);
        return new byte[frameCount * bytesPerSample * format.Channels];
    }

    public static byte[] Build(WavFormat format, IEnumerable<byte[]> pcmChunks)
    {
        var data = pcmChunks.SelectMany(c => c).ToArray();
        var byteRate = format.SampleRate * format.Channels * (format.BitsPerSample / 8);
        var blockAlign = (short)(format.Channels * (format.BitsPerSample / 8));

        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream);

        writer.Write("RIFF"u8.ToArray());
        writer.Write(36 + data.Length);
        writer.Write("WAVE"u8.ToArray());

        writer.Write("fmt "u8.ToArray());
        writer.Write(16);
        writer.Write((short)1); // PCM
        writer.Write(format.Channels);
        writer.Write(format.SampleRate);
        writer.Write(byteRate);
        writer.Write(blockAlign);
        writer.Write(format.BitsPerSample);

        writer.Write("data"u8.ToArray());
        writer.Write(data.Length);
        writer.Write(data);

        return stream.ToArray();
    }
}
