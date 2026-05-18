---
phase: 1
title: "Project Setup"
priority: High
status: Pending
effort: 2h
---

# Phase 01 — Project Setup

## Context Links
- [Plan Overview](plan.md)
- [Brainstorm Report](../reports/brainstorm-260225-1018-central-file-management-service.md)
- [.NET 8 Patterns Research](../reports/researcher-260225-1408-dotnet8-file-service-patterns.md)

## Overview
Create .NET 8 solution with Clean Architecture (4 projects), configure NuGet packages, project references, appsettings, and scripts/ folder structure. Initialize git repo.

## Key Insights
- Clean Architecture: Api → Core ← Infrastructure, Shared referenced by Api+Core
- EF Core has no first-class partition support — use raw SQL scripts instead of migrations
- scripts/ folder lives at solution root, NOT inside any .NET project

## Requirements

### Functional
- .NET 8 solution with 4 class library/web projects
- Correct project references (dependency flow)
- All NuGet packages installed
- Working `dotnet build` from day 1

### Non-Functional
- Solution builds without errors
- .gitignore excludes bin/obj/publish artifacts

## Architecture

```
D:\FIS\ai-first\file-manager\
├── FIS.FileManager.sln
├── src\
│   ├── FIS.FileManager.Api\              (webapi)
│   ├── FIS.FileManager.Core\             (classlib)
│   ├── FIS.FileManager.Infrastructure\   (classlib)
│   └── FIS.FileManager.Shared\           (classlib)
├── tests\
│   ├── FIS.FileManager.UnitTests\        (xunit)
│   └── FIS.FileManager.IntegrationTests\ (xunit)
├── scripts\
│   ├── pre-deployment\
│   ├── post-deployment\
│   ├── maintenance\
│   └── utilities\
├── docker\
├── docs\
├── .gitignore
└── .editorconfig
```

### Project References
```
Api → Core, Infrastructure, Shared
Core → Shared (for DTOs)
Infrastructure → Core (implements interfaces)
Shared → (no dependencies)
```

## Related Code Files

### Files to Create
- `FIS.FileManager.sln`
- `src/FIS.FileManager.Api/FIS.FileManager.Api.csproj`
- `src/FIS.FileManager.Core/FIS.FileManager.Core.csproj`
- `src/FIS.FileManager.Infrastructure/FIS.FileManager.Infrastructure.csproj`
- `src/FIS.FileManager.Shared/FIS.FileManager.Shared.csproj`
- `src/FIS.FileManager.Api/appsettings.json`
- `src/FIS.FileManager.Api/appsettings.Development.json`
- `src/FIS.FileManager.Api/Program.cs` (minimal placeholder)
- `.gitignore`, `.editorconfig`
- Empty scripts/ subfolders with `.gitkeep`

## Implementation Steps

### 1. Create solution and projects
```bash
cd D:\FIS\ai-first\file-manager

# Solution
dotnet new sln -n FIS.FileManager

# Projects
dotnet new webapi -n FIS.FileManager.Api -o src/FIS.FileManager.Api --no-openapi
dotnet new classlib -n FIS.FileManager.Core -o src/FIS.FileManager.Core
dotnet new classlib -n FIS.FileManager.Infrastructure -o src/FIS.FileManager.Infrastructure
dotnet new classlib -n FIS.FileManager.Shared -o src/FIS.FileManager.Shared

# Test projects
dotnet new xunit -n FIS.FileManager.UnitTests -o tests/FIS.FileManager.UnitTests
dotnet new xunit -n FIS.FileManager.IntegrationTests -o tests/FIS.FileManager.IntegrationTests

# Add to solution
dotnet sln add src/FIS.FileManager.Api
dotnet sln add src/FIS.FileManager.Core
dotnet sln add src/FIS.FileManager.Infrastructure
dotnet sln add src/FIS.FileManager.Shared
dotnet sln add tests/FIS.FileManager.UnitTests
dotnet sln add tests/FIS.FileManager.IntegrationTests
```

### 2. Add project references
```bash
# Api references
dotnet add src/FIS.FileManager.Api reference src/FIS.FileManager.Core
dotnet add src/FIS.FileManager.Api reference src/FIS.FileManager.Infrastructure
dotnet add src/FIS.FileManager.Api reference src/FIS.FileManager.Shared

# Core references
dotnet add src/FIS.FileManager.Core reference src/FIS.FileManager.Shared

# Infrastructure references
dotnet add src/FIS.FileManager.Infrastructure reference src/FIS.FileManager.Core

# Test references
dotnet add tests/FIS.FileManager.UnitTests reference src/FIS.FileManager.Core
dotnet add tests/FIS.FileManager.UnitTests reference src/FIS.FileManager.Shared
dotnet add tests/FIS.FileManager.IntegrationTests reference src/FIS.FileManager.Api
dotnet add tests/FIS.FileManager.IntegrationTests reference src/FIS.FileManager.Core
dotnet add tests/FIS.FileManager.IntegrationTests reference src/FIS.FileManager.Infrastructure
```

### 3. Install NuGet packages

**FIS.FileManager.Api:**
```bash
dotnet add src/FIS.FileManager.Api package Serilog.AspNetCore --version 8.0.3
dotnet add src/FIS.FileManager.Api package Serilog.Sinks.Console --version 6.0.0
dotnet add src/FIS.FileManager.Api package Serilog.Sinks.File --version 6.0.0
dotnet add src/FIS.FileManager.Api package AspNetCore.HealthChecks.SqlServer --version 8.0.2
dotnet add src/FIS.FileManager.Api package AspNetCore.HealthChecks.Redis --version 8.0.1
dotnet add src/FIS.FileManager.Api package Swashbuckle.AspNetCore --version 6.9.0
```

**FIS.FileManager.Core:**
```bash
dotnet add src/FIS.FileManager.Core package Microsoft.Extensions.DependencyInjection.Abstractions --version 8.0.2
dotnet add src/FIS.FileManager.Core package Microsoft.Extensions.Logging.Abstractions --version 8.0.2
```

**FIS.FileManager.Infrastructure:**
```bash
dotnet add src/FIS.FileManager.Infrastructure package Microsoft.EntityFrameworkCore.SqlServer --version 8.0.11
dotnet add src/FIS.FileManager.Infrastructure package Dapper --version 2.1.35
dotnet add src/FIS.FileManager.Infrastructure package Minio --version 6.0.3
dotnet add src/FIS.FileManager.Infrastructure package StackExchange.Redis --version 2.8.16
dotnet add src/FIS.FileManager.Infrastructure package Microsoft.Extensions.Http.Polly --version 8.0.11
dotnet add src/FIS.FileManager.Infrastructure package Polly.Extensions.Http --version 3.0.0
dotnet add src/FIS.FileManager.Infrastructure package Serilog --version 4.2.0
```

**FIS.FileManager.Shared:**
```bash
# No external packages — pure DTOs
```

**Test projects:**
```bash
dotnet add tests/FIS.FileManager.UnitTests package Moq --version 4.20.72
dotnet add tests/FIS.FileManager.UnitTests package FluentAssertions --version 6.12.2
dotnet add tests/FIS.FileManager.IntegrationTests package Microsoft.AspNetCore.Mvc.Testing --version 8.0.11
dotnet add tests/FIS.FileManager.IntegrationTests package Testcontainers.MsSql --version 4.1.0
dotnet add tests/FIS.FileManager.IntegrationTests package Testcontainers.Redis --version 4.1.0
```

### 4. Create scripts/ folder structure
```bash
mkdir -p scripts/pre-deployment scripts/post-deployment scripts/maintenance scripts/utilities
touch scripts/pre-deployment/.gitkeep
touch scripts/post-deployment/.gitkeep
touch scripts/maintenance/.gitkeep
touch scripts/utilities/.gitkeep
```

### 5. Create appsettings.json

<!-- Red Team: SA Password — 2026-02-25 -->
**IMPORTANT:** Do NOT commit real credentials to git. Use `dotnet user-secrets` for dev:
```bash
dotnet user-secrets init --project src/FIS.FileManager.Api
dotnet user-secrets set "ConnectionStrings:SqlServer" "Server=10.14.142.30\\BTP;Database=FILE;User Id=sa;Password=123456;TrustServerCertificate=True;"
```

```json
{
  "ConnectionStrings": {
    "SqlServer": "Server=10.14.142.30\\BTP;Database=FILE;TrustServerCertificate=True;",
    "Redis": "localhost:6379"
  },
  "MinIO": {
    "Endpoint": "10.14.142.32:9000",
    "AccessKey": "minioadmin",
    "SecretKey": "minioadmin",
    "UseSSL": false,
    "Region": "us-east-1",
    "DefaultBucket": "btp"
  },
  "FileService": {
    "MaxFileSizeBytes": 104857600,
    "MemoryBufferThresholdBytes": 10485760,
    "TempFileDirectory": "temp-uploads",
    "StalePendingMinutes": 15,
    "OrphanGraceDays": 7,
    "CleanupIntervalMinutes": 60,
    "AuditRetentionMonths": 12
  },
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "System": "Warning"
      }
    },
    "WriteTo": [
      { "Name": "Console" },
      { "Name": "File", "Args": { "path": "logs/log-.txt", "rollingInterval": "Day" } }
    ]
  }
}
```

### 6. Create appsettings.Development.json
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Debug"
    }
  },
  "Serilog": {
    "MinimumLevel": {
      "Default": "Debug"
    }
  }
}
```

### 7. Create .gitignore
Standard .NET .gitignore: bin/, obj/, publish/, *.user, .vs/, logs/, temp-uploads/
**ALSO include:** `appsettings.Production.json`, `docker/.env` (no credentials in git)

### 8. Create .editorconfig
Standard C# .editorconfig: 4-space indent, UTF-8, LF line endings, file-scoped namespaces

### 9. Create placeholder Program.cs
```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/", () => "FIS File Manager API");
app.Run();
```

### 10. Init git repo
```bash
git init
git add .
git commit -m "feat: initialize .NET 8 solution with clean architecture"
```

### 11. Verify build
```bash
dotnet build FIS.FileManager.sln
```

## Todo List
- [ ] Create solution and all 6 projects
- [ ] Configure project references
- [ ] Install NuGet packages
- [ ] Create scripts/ folder structure
- [ ] Write appsettings.json + Development
- [ ] Create .gitignore + .editorconfig
- [ ] Write placeholder Program.cs
- [ ] Init git repo
- [ ] Verify `dotnet build` succeeds

## Success Criteria
- `dotnet build FIS.FileManager.sln` succeeds with 0 errors
- All project references resolve correctly
- scripts/ folder structure exists with 4 subdirectories
- Git repo initialized with initial commit

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| NuGet package version conflicts | Pin exact versions, test build immediately |
| .NET 8 SDK not installed | Verify with `dotnet --version` first |

## Security Considerations
- appsettings.json contains DB password — add appsettings.Production.json to .gitignore
- Use environment variables or user-secrets for production credentials

## Next Steps
→ Phase 02: Database Schema (can start immediately after build succeeds)
→ Phase 03: Core Layer (can start in parallel with Phase 02)
