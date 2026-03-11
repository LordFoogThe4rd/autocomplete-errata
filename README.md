# Autocomplete Plugin

The **Autocomplete** plugin provides a simple way to generate text continuations for your story in [Errata](https://github.com/tealios/errata) using the `/v1/completions` endpoint.

This plugin is **entirely client-side**. It does not use Errata's server-side LLM configuration; instead, you provide your own API key and endpoint directly in the plugin panel.

## Features

- **Text Continuation**: Generates the next part of your story based on the current prose.
- **Meta Context**: Optionally include non-prose context like guidelines, character sheets, and knowledge fragments in the prompt.
- **Append or New Fragment**: Choose to append the generated text to the last prose fragment or create a completely new prose fragment.
- **Adjustable Temperature**: Control the randomness and creativity of the generated output.
- **Custom Separators**: Define a custom string (e.g., `\n***\n`) to separate meta fragments from prose fragments.
- **Newline Formatting**: Optionally force single or double newlines in the prompt context to influence the model's output style.

## Installation

To install the **Autocomplete** plugin into your Errata instance:

### Method 1: Using Git (Recommended)
1. Open a terminal in your Errata root directory.
2. Navigate to the `plugins` folder:
   ```bash
   cd plugins
   ```
3. Clone the plugin repo:
   ```bash
   git clone https://github.com/tealios/errata-plugin-autocomplete.git autocomplete-errata
   ```

### Method 2: Download as ZIP
1. Download the plugin source code as a ZIP file from GitHub.
2. Extract the contents into your Errata installation's `plugins/autocomplete-errata` directory.
3. Ensure the folder structure looks like: `errata/plugins/autocomplete-errata/plugin.ts`.

After installing, restart your Errata development server or restart the application to register the new plugin.

## Updating

If you installed via Git, you can update the plugin by navigating to the plugin's directory and pulling the latest changes:

```bash
cd plugins/autocomplete-errata
git pull
```

**Note:** You generally do not need to restart Errata after updating a plugin unless there are major changes, which will be announced beforehand.

## Usage

1. Enable the **Autocomplete** plugin in your story settings.
2. Open the **Autocomplete** panel in the plugin sidebar.
3. **Configure your LLM**:
   - **API Key**: Enter your provider's API key (e.g., OpenAI, Anthropic, or OpenRouter).
   - **Endpoint URL**: Specify the base URL (e.g., `http://localhost:11434/v1` for Ollama).
   - **Model Name**: Specify the model to use (check your provider's documentation for available models).
4. **Generation Settings**:
   - **Include Meta Fragments**: Check this to include guidelines, characters, and knowledge.
   - **Append to Last Fragment**: If unchecked, a new fragment named "Autocomplete" will be created.
   - **Temperature**: Adjust the randomness (0.0 to 2.0).
5. Click **Generate Completion**.

## Technical Details

The plugin works by:
1. Fetching your story's fragments via Errata's public REST API (`/api/stories/{id}/fragments`).
2. Assembling the prompt text and applying formatting rules directly in the React component.
3. Sending a `POST` request to your configured `Endpoint URL` with your `API Key`.
4. Saving the generated text back to Errata using `PATCH` (to append) or `POST` (to create new) fragment endpoints.
5. Triggering a UI refresh via the `errata:plugin:invalidate` event.
