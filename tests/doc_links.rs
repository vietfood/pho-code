use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

#[test]
fn local_markdown_links_and_headings_exist() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut files = vec![root.join("AGENTS.md")];
    collect_markdown(&root.join("docs"), &mut files);
    let mut failures = Vec::new();
    for source in files {
        let text = fs::read_to_string(&source)
            .unwrap_or_else(|error| panic!("{}: {error}", source.display()));
        for destination in markdown_destinations(&text) {
            if destination.starts_with("http://")
                || destination.starts_with("https://")
                || destination.starts_with("mailto:")
            {
                continue;
            }
            let destination = destination.trim_matches(['<', '>']);
            let (path_text, fragment) = destination
                .split_once('#')
                .map_or((destination, None), |(path, fragment)| {
                    (path, Some(fragment))
                });
            let target = if path_text.is_empty() {
                source.clone()
            } else {
                source.parent().unwrap().join(path_text)
            };
            if !target.exists() {
                failures.push(format!("{} -> missing {}", source.display(), destination));
                continue;
            }
            let Some(fragment) = fragment else { continue };
            if is_source_line_fragment(fragment)
                || target.extension().and_then(|value| value.to_str()) != Some("md")
            {
                continue;
            }
            let headings = markdown_headings(&target);
            if !headings.contains(fragment) {
                failures.push(format!(
                    "{} -> missing heading {}#{}",
                    source.display(),
                    target.display(),
                    fragment
                ));
            }
        }
    }
    assert!(
        failures.is_empty(),
        "documentation link failures:\n{}",
        failures.join("\n")
    );
}

fn collect_markdown(directory: &Path, output: &mut Vec<PathBuf>) {
    for entry in
        fs::read_dir(directory).unwrap_or_else(|error| panic!("{}: {error}", directory.display()))
    {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect_markdown(&path, output);
        } else if path.extension().and_then(|value| value.to_str()) == Some("md") {
            output.push(path);
        }
    }
}

fn markdown_destinations(text: &str) -> Vec<&str> {
    let mut remaining = text;
    let mut output = Vec::new();
    while let Some(start) = remaining.find("](") {
        remaining = &remaining[start + 2..];
        let Some(end) = remaining.find(')') else {
            break;
        };
        let destination = remaining[..end]
            .split_ascii_whitespace()
            .next()
            .unwrap_or("");
        if !destination.is_empty() {
            output.push(destination);
        }
        remaining = &remaining[end + 1..];
    }
    output
}

fn markdown_headings(path: &Path) -> BTreeSet<String> {
    fs::read_to_string(path)
        .unwrap()
        .lines()
        .filter_map(|line| {
            let heading = line
                .trim_start()
                .strip_prefix('#')?
                .trim_start_matches('#')
                .trim();
            (!heading.is_empty()).then(|| github_slug(heading))
        })
        .collect()
}

fn github_slug(heading: &str) -> String {
    let mut slug = String::new();
    for character in heading.chars().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() || character == '-' || character == '_' {
            slug.push(character);
        } else if character.is_whitespace() {
            slug.push('-');
        }
    }
    slug
}

fn is_source_line_fragment(fragment: &str) -> bool {
    fragment.strip_prefix('L').is_some_and(|rest| {
        rest.split("-L")
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
    })
}
