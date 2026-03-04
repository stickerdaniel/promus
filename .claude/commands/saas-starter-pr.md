Apply the latest PR from the saas-starter upstream repo to this project.

## Steps

1. **Find the newest merged PR** in the saas-starter repo at `../../../svelte/saas-starter` using `gh pr list --repo` or by checking the local repo directly. Show the PR title, number, and summary of changes.

2. **Get the commits** from that PR. Use `git log` in the saas-starter repo to find the commits included in the PR.

3. **Generate a patch** for each commit using `git format-patch` or `git diff` in the saas-starter repo.

4. **Review the patch** and determine which changes are applicable to this project. Skip changes to files that don't exist here or that would conflict with our customizations. Present a summary of what will be applied and what will be skipped.

5. **Apply the relevant changes** to this repo, adapting file paths if needed. Use the Edit tool to make the changes — do not blindly apply patches.

6. **Run checks** after applying: `bun run check` to verify nothing is broken.

7. **Commit** the changes with message format: `chore(upstream): apply saas-starter PR #<number> — <title>`

If the saas-starter repo is not found at the expected path, ask the user for the correct location.
