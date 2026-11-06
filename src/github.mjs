// Recent commits by the user across their recently pushed public repos.
// Uses the plain REST API; GITHUB_TOKEN (provided free inside Actions) only
// raises the rate limit, it is not required.

const API = 'https://api.github.com';

async function get(path, token) {
  const res = await fetch(API + path, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'readme-swarm',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json();
}

export async function recentCommits({ user, max = 7, repos: only, exclude = [], days = 45, perRepo, token }) {
  let repos = await get(`/users/${user}/repos?type=owner&sort=pushed&per_page=20`, token);
  const since = Date.now() - days * 864e5;
  repos = repos.filter((r) => !r.fork && !r.private && new Date(r.pushed_at).getTime() > since);
  if (only?.length) repos = repos.filter((r) => only.includes(r.name));
  repos = repos.filter((r) => !exclude.includes(r.name)).slice(0, 6);

  const all = [];
  for (const r of repos) {
    const list = await get(`/repos/${user}/${r.name}/commits?per_page=15`, token);
    for (const c of list) {
      const message = c.commit.message.split('\n')[0].trim();
      if (/^merge (pull request|branch)/i.test(message)) continue;
      const login = c.author?.login;
      if (login && login.toLowerCase() !== user.toLowerCase()) continue;
      all.push({ repo: r.name, message, date: c.commit.author.date, sha: c.sha.slice(0, 7) });
    }
  }
  // Take the newest few from every repo first, so one busy repo can't push
  // the others off the timeline, then fill up with whatever is newest.
  all.sort((a, b) => b.date.localeCompare(a.date));
  const each = Math.max(1, perRepo ?? Math.floor(max / Math.max(1, repos.length)));
  const picked = [];
  for (const r of repos) picked.push(...all.filter((c) => c.repo === r.name).slice(0, each));
  for (const c of all) if (picked.length < max && !picked.includes(c)) picked.push(c);
  return picked.sort((a, b) => b.date.localeCompare(a.date)).slice(0, max).reverse();
}
