# Contributing to multi-mysql-mcp-server

Thank you for your interest in contributing!

## Development Setup

### Prerequisites
- **Node.js** >= 18
- **npm** >= 9
- **MySQL** or **MariaDB** (for integration testing)

### Getting Started
1. Clone: `git clone https://github.com/VKirill/multi-mysql-mcp-server.git`
2. Install: `npm install`
3. Build: `npm run build`
4. Dev mode: `npm run dev`

## Project Structure
```
src/
├── index.ts              # Main MCP server
└── __tests__/
    └── index.test.ts     # Tests
```

## Workflow
1. Branch from `master`
2. Make changes, run `npm run lint && npm test && npm run build`
3. Submit PR with description

## PR Checklist
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] Tests added for new features
- [ ] CHANGELOG.md updated

## Security
See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License
MIT — see [LICENSE](LICENSE).
