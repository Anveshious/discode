const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function updateChangelog(changelog, entry) {
    const headingIndex = changelog.search(/^## \[Unreleased\]\s*$/m);
    if (headingIndex === -1) {
        throw new Error("CHANGELOG.md is missing the ## [Unreleased] section.");
    }

    const newline = changelog.includes("\r\n") ? "\r\n" : "\n";
    const lines = changelog.split(/\r?\n/);
    const unreleasedIndex = lines.findIndex((line) => /^## \[Unreleased\]\s*$/.test(line));
    const nextSectionIndex = lines.findIndex(
        (line, index) => index > unreleasedIndex && /^## /.test(line)
    );
    const sectionEndIndex = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
    const categoryHeading = "### Changed";
    const categoryIndex = lines.findIndex(
        (line, index) => index > unreleasedIndex && index < sectionEndIndex && line === categoryHeading
    );

    if (categoryIndex !== -1) {
        let insertionIndex = categoryIndex + 1;
        while (insertionIndex < sectionEndIndex && lines[insertionIndex].trim() === "") {
            insertionIndex++;
        }
        lines.splice(insertionIndex, 0, `- ${entry}`);
    } else {
        let insertionIndex = sectionEndIndex;
        while (insertionIndex > unreleasedIndex + 1 && lines[insertionIndex - 1].trim() === "") {
            insertionIndex--;
        }
        lines.splice(
            insertionIndex,
            sectionEndIndex - insertionIndex,
            "",
            categoryHeading,
            "",
            `- ${entry}`,
            ""
        );
    }

    return lines.join(newline);
}

function getCommitEntry(repoRoot) {
    const changedPaths = execFileSync(
        "git",
        ["diff", "--cached", "--name-only", "--diff-filter=ACDMR", "-z"],
        { cwd: repoRoot, encoding: "utf8" }
    ).split("\0").filter(Boolean);
    if (changedPaths.length === 0) {
        return "Empty commit";
    }

    const listedPaths = changedPaths
        .slice(0, 5)
        .map((filePath) => `\`${filePath.replace(/`/g, "\\`")}\``)
        .join(", ");
    const remaining = changedPaths.length - 5;
    return `Staged paths: ${listedPaths}${remaining > 0 ? `, and ${remaining} more` : ""}`;
}

function updateForCommit(repoRoot) {
    const entry = getCommitEntry(repoRoot);
    const changelogPath = path.join(repoRoot, "CHANGELOG.md");
    const changelog = fs.readFileSync(changelogPath, "utf8");
    fs.writeFileSync(changelogPath, updateChangelog(changelog, entry));
    execFileSync("git", ["add", "--", "CHANGELOG.md"], { cwd: repoRoot, stdio: "inherit" });
    console.log("Added staged file paths to CHANGELOG.md.");
}

function main() {
    const repoRoot = path.resolve(__dirname, "..");
    updateForCommit(repoRoot);
}

if (require.main === module) {
    main();
}

module.exports = { updateChangelog };
