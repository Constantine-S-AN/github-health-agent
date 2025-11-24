# Contributing to GitHub Health Agent

Welcome! We're excited you're interested in contributing to the GitHub Health Agent. This guide will help you get up and running quickly and ensure your contributions align with the project's standards.

## 🚀 Quick Start

### Prerequisites

Before contributing, make sure you have:

- **[Deno 2.x](https://deno.land/)** installed
- A **GitHub Personal Access Token (PAT)** with `public_repo` scope
- An **Anthropic API key** for Claude access
- **Git** for version control
- **Python 3.8+** (optional, for MIRIX memory service)

### Local Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/github-health-agent.git
   cd github-health-agent
   ```

2. **Environment Setup**
   ```bash
   # Copy and customize the environment template
   cp .env.example .env  # Create this file with your keys
   
   # Required environment variables:
   # ANTHROPIC_API_KEY=your_anthropic_key_here
   # GITHUB_TOKEN=your_github_pat_here
   # GITHUB_ACCESS_TOKEN=your_github_pat_here (same as above)
   # GITHUB_PERSONAL_ACCESS_TOKEN=your_github_pat_here (same as above)
   # MIRIX_URL=http://127.0.0.1:8000  # optional
   ```

3. **Verify Installation**
   ```bash
   # Test CLI mode
   deno run -A --env-file=.env github-health-agent.ts scribear/ScribeAR.github.io --mode=plan
   
   # Test web server
   deno run -A --env-file=.env web-server.ts
   # Visit http://localhost:8000
   ```

4. **Optional: MIRIX Memory Service**
   ```bash
   pip install fastapi uvicorn python-dotenv mirix
   uvicorn mirix_service:app --port 8000 --reload
   ```

### Troubleshooting Common Setup Issues

- **"Permission denied" errors**: Make sure to use `-A` flag for Deno permissions
- **API authentication failures**: Verify your GitHub PAT has the correct scopes
- **MIRIX connection errors**: Check if the Python service is running on port 8000
- **Import resolution issues**: Run `deno cache --reload github-health-agent.ts`

---

## 🛠️ Development Workflow

### Branch Naming Conventions

- **Feature branches**: `feature/descriptive-name` or `feat/issue-123`
- **Bug fixes**: `fix/issue-description` or `bugfix/issue-123`
- **Documentation**: `docs/update-contributing` or `docs/issue-123`
- **Refactoring**: `refactor/component-name`

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(agent): add backlog cleanup scenario
fix(web): resolve mobile responsiveness issues  
docs(readme): update setup instructions
test(health): add unit tests for score calculation
```

### Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** following our code standards
3. **Test your changes** thoroughly (see Testing Guidelines)
4. **Update documentation** if needed
5. **Submit a pull request** with:
   - Clear title and description
   - Reference to related issues (`Fixes #123`)
   - Screenshots for UI changes
   - Testing instructions

### Code Review Expectations

- **All PRs require review** before merging
- **Be responsive** to feedback and questions
- **Keep PRs focused** - one feature/fix per PR
- **Update your branch** if main has moved forward
- **Maintain respectful discussion** in review comments

---

## 🧪 Testing Guidelines

### Running Existing Tests

```bash
# Run all tests (when implemented)
deno test --allow-all

# Run with coverage
deno test --allow-all --coverage=cov_profile
deno coverage cov_profile
```

### Writing New Tests

- **Place tests** in `tests/` directory or alongside source files with `.test.ts` extension
- **Mock external APIs** (GitHub, Anthropic) for reliable testing
- **Test edge cases**: empty repositories, rate limits, network failures
- **Include integration tests** for end-to-end scenarios

### Testing Checklist

- [ ] Unit tests for core health score logic
- [ ] Integration tests for GitHub MCP interactions  
- [ ] Error handling for API failures and timeouts
- [ ] UI functionality (if applicable)
- [ ] Performance with large repositories

---

## 🎯 Code Standards

### TypeScript/Deno Conventions

- **Use TypeScript** for all new code with strict types
- **Follow Deno formatting**: Run `deno fmt` before committing
- **Use Deno linting**: Run `deno lint` and fix issues
- **Prefer JSR imports** over npm when available
- **Export types explicitly** from modules

### Import Organization

```typescript
// 1. External JSR imports
import { z } from "jsr:@zod/zod";
import { Zypher } from "jsr:@corespeed/zypher";

// 2. External npm imports  
import { fromEvent } from "npm:rxjs-for-await";

// 3. Local imports
import { MirixClient } from "./mirix-client.ts";
import type { HealthReport } from "./types.ts";
```

### Code Style Guidelines

- **Use descriptive variable names**: `healthScore` not `hs`
- **Prefer async/await** over Promise chains
- **Handle errors explicitly** - no silent failures
- **Add JSDoc comments** for public functions
- **Keep functions focused** - single responsibility principle

---

## 🏗️ Architecture Overview

### Core Components

```
├── github-health-agent.ts    # Main CLI agent
├── web-server.ts            # HTTP server for web UI
├── mirix-client.ts          # Memory service integration
├── mirix_service.py         # FastAPI memory service
└── index.html               # Web frontend
```

### Key Integrations

- **Zypher Framework**: Agent orchestration and LLM interactions
- **GitHub MCP**: Repository data fetching via GitHub API
- **MIRIX**: Optional episodic memory for run history
- **Anthropic Claude**: Health analysis and report generation

### Data Flow

1. **Input**: Repository URL or owner/repo string
2. **Fetch**: GitHub data via MCP tools (issues, PRs, commits)
3. **Analyze**: LLM processes data and calculates health score
4. **Memory**: Store run summary in MIRIX (optional)
5. **Output**: Markdown report with score and recommendations

### Extending the Agent

#### Adding New Health Metrics

```typescript
// In your analyzer function
const customMetric = calculateCustomMetric(repoData);
const healthFactors = {
  ...existingFactors,
  customMetric: customMetric * 0.1 // 10% weight
};
```

#### Adding New Scenarios

1. Update the `scenario` type definition
2. Add scenario-specific prompts in the agent logic
3. Test with various repository types

#### Adding New MCP Tools

```typescript
// The agent automatically has access to all github-mcp tools
// Reference: https://github.com/anthropics/mcp-github
await zypher.call("github_search_code", { 
  q: "filename:package.json" 
});
```

---

## 🤝 Contribution Types

### Bug Fixes

- **Identify the root cause** before proposing solutions
- **Include reproduction steps** in your PR description
- **Add regression tests** when possible
- **Consider backward compatibility** impacts

### Feature Additions

- **Discuss large features** in issues before implementing
- **Keep features focused** and avoid scope creep
- **Update documentation** including README and help text
- **Consider configuration options** for flexibility

### Documentation Improvements

- **Keep docs up-to-date** with code changes
- **Include examples** for new features
- **Fix typos and unclear explanations**
- **Add screenshots** for UI changes

### Performance Optimizations

- **Measure before optimizing** - include benchmarks
- **Consider memory usage** especially for large repositories
- **Test with various repository sizes** and types
- **Document performance implications**

---

## 📋 Review Process

### What Maintainers Look For

- **Code quality**: Clean, readable, well-structured code
- **Testing**: Adequate test coverage for changes
- **Documentation**: Updated docs and clear PR description
- **Compatibility**: No breaking changes without discussion
- **Performance**: No significant performance regressions

### Timeline Expectations

- **Initial response**: Within 48 hours for new PRs
- **Review completion**: Within 1 week for standard PRs
- **Complex features**: May require multiple review rounds
- **Urgent fixes**: Prioritized for faster review

### Addressing Feedback

- **Respond promptly** to review comments
- **Ask questions** if feedback is unclear
- **Make requested changes** in additional commits
- **Squash commits** before final merge (if requested)
- **Update your branch** if main has advanced

---

## 🏆 Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports, feature requests, questions
- **Pull Request Comments**: Code-specific discussions
- **GitHub Discussions**: General questions and ideas

### Common Questions

**Q: How do I test changes without affecting real repositories?**
A: Use the plan mode (`--mode=plan`) which is read-only, or create test repositories.

**Q: Can I contribute without an Anthropic API key?**
A: Unfortunately, no. The agent requires Claude for analysis. Consider the free tier.

**Q: How do I add support for private repositories?**
A: Ensure your GitHub PAT has the `repo` scope instead of just `public_repo`.

**Q: The agent is slow on large repositories. Is this normal?**
A: Yes, this is expected. Consider optimizing API calls or adding pagination.

---

## 📊 Contribution Statistics

We value all contributions! Here's what makes a great contributor:

- **Quality over quantity** - well-tested, documented changes
- **Community focus** - helping others and improving the project for everyone  
- **Consistency** - regular, small contributions often beat large, infrequent ones
- **Learning mindset** - willingness to iterate and improve based on feedback

---

Thank you for contributing to GitHub Health Agent! Your efforts help make repository health monitoring accessible and actionable for developers everywhere.

For questions not covered here, please open an issue or start a discussion. We're here to help! 🚀