# Pho Code beta software terms

These terms apply to a signed Pho Code desktop application that you download or install. Source code in this repository remains available under the MIT License in `LICENSE`. If the two conflict for source you obtained from the repository, MIT controls that source.

Pho Code is beta software for trusted local development workspaces. It may contain defects. Keep ordinary version control and backups.

## What the application may do

When you open a folder, Pho Code, the embedded Pi runtime, baked features, agent tools, and child processes may read, write, and execute with your user account's authority in that folder and anywhere else the agent is allowed to reach. Renderer sandboxing, process separation, and the agent-tool sandbox are not a container for hostile repositories.

Network use includes provider APIs, GitHub when you enable that integration, public web tools, and the configured update host. There is no telemetry and no automatic crash upload in this product.

## No warranty

The application is provided “as is”, without warranty of any kind. The authors are not liable for data loss, leaked secrets, or damage arising from use of the software, to the maximum extent permitted by law.

## Recovery limits

Failed updates, migrations, or runtime crashes should preserve the last known application data rather than silently reset it. Arbitrary downgrade after a newer data schema is accepted is not promised. Provider credentials stay in OS-backed storage and are not a backup included with diagnostics.

## Trademarks

“Pho Code” is the product name of this application. Third-party names and marks (including Pi, providers, and GitHub) remain their owners' property and are used only to identify those services.
