export type GitHubActivity = {
  sha: string;
  message: string;
  author: string;
  committedAt: string;
  url: string;
};

export async function getRecentGitHubActivity(hours = 24): Promise<GitHubActivity[]> {
  const repository = process.env.GITHUB_REPOSITORY?.trim() || "patdudley/StripePros";
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const response = await fetch(`https://api.github.com/repos/${repository}/commits?since=${encodeURIComponent(since)}&per_page=50`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "StripePros-FounderHQ/1.0",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!response.ok) return [];
  const commits = await response.json() as Array<{
    sha: string;
    html_url: string;
    commit: { message: string; author?: { name?: string; date?: string } };
    author?: { login?: string };
  }>;
  return commits.map((item) => ({
    sha: item.sha.slice(0, 7),
    message: item.commit.message.split("\n")[0] || "Updated Stripe Pros",
    author: item.author?.login || item.commit.author?.name || "Founder",
    committedAt: item.commit.author?.date || new Date().toISOString(),
    url: item.html_url,
  }));
}
