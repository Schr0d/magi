export async function loadFixtureCase(path = 'test/fixtures/magi-case-sample.json') {
  const resp = await fetch(path, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`fixture ${resp.status}`);
  return await resp.json();
}
