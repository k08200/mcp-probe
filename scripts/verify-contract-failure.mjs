import { checkMcpServer } from '../dist/checker.js';

const report = await checkMcpServer({
  target: './tests/fixtures/stdio-mcp-server.js',
  timeoutMs: 10000,
  toolsFile: './examples/contract-failure.tools.json',
});

function fail(message) {
  console.error(message);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

if (report.overallStatus !== 'fail') {
  fail(`Expected overallStatus=fail, got ${report.overallStatus}`);
}

const dryRunCheck = report.checks.find((check) => check.name === 'Tool call dry-run');
if (dryRunCheck?.issue?.code !== 'CONTRACT_ASSERTION_FAILED') {
  fail(`Expected Tool call dry-run issue CONTRACT_ASSERTION_FAILED, got ${dryRunCheck?.issue?.code ?? 'none'}`);
}

const dbQuery = report.toolCallResults?.find((result) => result.tool === 'db_query');
if (dbQuery?.issue?.code !== 'CONTRACT_ASSERTION_FAILED') {
  fail(`Expected db_query issue CONTRACT_ASSERTION_FAILED, got ${dbQuery?.issue?.code ?? 'none'}`);
}

const failedAssertions = dbQuery.assertions?.filter((assertion) => assertion.status === 'fail') ?? [];
const failedNames = failedAssertions.map((assertion) => assertion.name);

for (const expected of ['requiredFields.tenantId', 'maxRows']) {
  if (!failedNames.includes(expected)) {
    fail(`Expected failed assertion ${expected}, got ${failedNames.join(', ') || 'none'}`);
  }
}

const dbWrite = report.toolCallResults?.find((result) => result.tool === 'db_write');
if (dbWrite?.status !== 'pass') {
  fail(`Expected db_write denied-write probe to pass, got ${dbWrite?.status ?? 'missing'}`);
}

console.log('contract failure fixture produced CONTRACT_ASSERTION_FAILED as expected');
