/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true';
const repoName = process.env.REPO_NAME || '';

const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: isGithubPages && repoName ? `/${repoName}` : '',
  assetPrefix: isGithubPages && repoName ? `/${repoName}/` : '',
  trailingSlash: true,
};

module.exports = nextConfig;
