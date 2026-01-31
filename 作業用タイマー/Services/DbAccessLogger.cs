using System.Diagnostics;

namespace 作業用タイマー.Services;

public interface IDbAccessLogger
{
    Task ExecuteAsync(string operation, Func<CancellationToken, Task> action, CancellationToken cancellationToken = default);
    Task<TResult> ExecuteAsync<TResult>(string operation, Func<CancellationToken, Task<TResult>> action, CancellationToken cancellationToken = default);
}

public class DbAccessLogger : IDbAccessLogger
{
    private readonly ILogger<DbAccessLogger> _logger;

    public DbAccessLogger(ILogger<DbAccessLogger> logger)
    {
        _logger = logger;
    }

    public async Task ExecuteAsync(string operation, Func<CancellationToken, Task> action, CancellationToken cancellationToken = default)
    {
        await ExecuteAsync<object?>(operation, async token =>
        {
            await action(token);
            return null;
        }, cancellationToken);
    }

    public async Task<TResult> ExecuteAsync<TResult>(string operation, Func<CancellationToken, Task<TResult>> action, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        _logger.LogDebug("DB access started: {Operation}", operation);

        try
        {
            var result = await action(cancellationToken);
            stopwatch.Stop();
            _logger.LogDebug("DB access succeeded: {Operation} ({ElapsedMilliseconds}ms)", operation, stopwatch.ElapsedMilliseconds);
            return result;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogDebug(ex, "DB access failed: {Operation} ({ElapsedMilliseconds}ms)", operation, stopwatch.ElapsedMilliseconds);
            throw;
        }
    }
}
