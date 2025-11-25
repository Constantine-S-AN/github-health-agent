# Security Policy

## Supported Versions

We are committed to providing security updates for the GitHub Health Agent. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

## Reporting a Vulnerability

The GitHub Health Agent team takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Do not** report security vulnerabilities through public GitHub issues, discussions, or pull requests.

Instead, please report security issues by emailing: **shijiea2@illinois.edu**

Include as much of the following information as possible:
- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### Response Timeline

- **Initial Response**: Within 48 hours of report
- **Status Updates**: Every 7 days until resolution
- **Fix Development**: Target 90 days for non-critical, 30 days for critical
- **Public Disclosure**: Coordinated disclosure after fix deployment

## Security Considerations

The GitHub Health Agent handles sensitive data including:

- **GitHub Personal Access Tokens** - stored in environment variables
- **Anthropic API Keys** - used for LLM processing  
- **Repository Analysis Data** - temporary processing of repo metadata
- **MIRIX Memory** - persistent storage of analysis history

### Key Security Features

- **Environment Variable Security** - All API keys stored as env vars, never hardcoded
- **Minimal Permissions** - GitHub tokens only need read access for public repos
- **Local Processing** - No data transmitted to third parties except Anthropic/GitHub APIs
- **Memory Isolation** - MIRIX service provides optional persistent memory with local fallback

### Known Security Limitations

- **API Key Exposure Risk** - Environment variables may be visible in process lists
- **Memory Persistence** - MIRIX service stores analysis history (can be disabled)
- **Network Dependencies** - Requires external API access (GitHub, Anthropic)

## Security Best Practices for Users

When deploying the GitHub Health Agent:

1. **Use minimal GitHub token permissions** - `public_repo` scope is sufficient for public repositories
2. **Rotate API keys regularly** - Especially for production deployments
3. **Secure environment files** - Never commit `.env` files to version control
4. **Network security** - Use HTTPS for all API communications
5. **Container security** - When using Docker, run as non-root user
6. **Monitor access logs** - Track API usage for unusual patterns

## Responsible Disclosure

We believe in responsible disclosure and will:

- Acknowledge your contribution to improving security
- Work with you to understand and resolve the issue
- Provide credit in security advisories (if desired)
- Keep you informed throughout the resolution process

Thank you for helping keep the GitHub Health Agent and our users safe!