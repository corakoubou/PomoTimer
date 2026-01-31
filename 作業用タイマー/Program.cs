using System.Diagnostics;
using Ɨp^C}[.Services;
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorPages();
builder.Services.AddScoped<IDbAccessLogger, DbAccessLogger>();

var app = builder.Build();

// ★ 起動するURLを決める（ポートは好きな番号でOK）っす
var url = "http://localhost:5081";
app.Urls.Clear();
app.Urls.Add(url);

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseDefaultFiles();
app.UseStaticFiles();

//app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.MapRazorPages();

// ★ アプリ起動後にブラウザを自動で開く処理っす
app.Lifetime.ApplicationStarted.Register(() =>
{
    try
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = "chrome.exe",
            Arguments = url,
            UseShellExecute = true
        });
    }
    catch
    {
        // 失敗してもアプリ自体は動くので握りつぶしちゃうっす
    }
});

app.Run();
