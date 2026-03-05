import * as vscode from 'vscode';
import { PermissionMode, Model } from '../types';

export interface NewTaskFormData {
  name: string;
  useWorktree: boolean;
  model: Model;
  permissionMode: PermissionMode;
}

export class NewTaskPanel {
  public static currentPanel: NewTaskPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private _defaultModel: Model = 'opus';
  private _defaultPermissionMode: PermissionMode = 'fullAuto';
  private _worktreeBasePath: string = '../worktrees';

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static show(
    extensionUri: vscode.Uri,
    defaultModel: Model,
    defaultPermissionMode: PermissionMode,
    worktreeBasePath: string,
    onSubmit: (data: NewTaskFormData) => void,
    onCancel: () => void,
  ): NewTaskPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel already exists, dispose it
    if (NewTaskPanel.currentPanel) {
      NewTaskPanel.currentPanel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      'swarmNewTask',
      'New Task',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
      },
    );

    NewTaskPanel.currentPanel = new NewTaskPanel(panel, extensionUri);
    NewTaskPanel.currentPanel._defaultModel = defaultModel;
    NewTaskPanel.currentPanel._defaultPermissionMode = defaultPermissionMode;
    NewTaskPanel.currentPanel._worktreeBasePath = worktreeBasePath;
    NewTaskPanel.currentPanel._panel.webview.html = NewTaskPanel.currentPanel._getHtmlForWebview();

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'submit':
            onSubmit(message.data as NewTaskFormData);
            NewTaskPanel.currentPanel?.dispose();
            break;
          case 'cancel':
            onCancel();
            NewTaskPanel.currentPanel?.dispose();
            break;
        }
      },
      null,
      NewTaskPanel.currentPanel._disposables,
    );

    return NewTaskPanel.currentPanel;
  }

  public dispose() {
    NewTaskPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  private _getHtmlForWebview(): string {
    const model = this._defaultModel;
    const perm = this._defaultPermissionMode;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Task</title>
  <link rel="stylesheet" href="https://unpkg.com/@vscode/codicons/dist/codicon.css">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      height: 100%;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      width: 100%;
      max-width: 420px;
    }
    .header {
      text-align: center;
      margin-bottom: 28px;
    }
    .header-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      color: var(--vscode-foreground);
      opacity: 0.8;
    }
    .header-icon i {
      font-size: 48px;
      line-height: 48px;
    }
    .header h2 {
      font-weight: 600;
      font-size: 1.3em;
      color: var(--vscode-foreground);
      letter-spacing: -0.01em;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group-label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
    }
    input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)));
      border-radius: 6px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-size: var(--vscode-font-size);
      transition: border-color 0.15s ease;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    input[type="text"]::placeholder {
      color: var(--vscode-input-placeholderForeground, rgba(128, 128, 128, 0.7));
    }
    .checkbox-group {
      padding: 10px 12px;
      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)));
      border-radius: 6px;
      background-color: var(--vscode-input-background);
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .checkbox-group:hover {
      border-color: var(--vscode-focusBorder);
    }
    .checkbox-group input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--vscode-button-background);
      cursor: pointer;
    }
    .checkbox-group label {
      cursor: pointer;
      font-size: var(--vscode-font-size);
      user-select: none;
    }
    .radio-group {
      display: flex;
      gap: 8px;
    }
    .radio-option {
      flex: 1;
      position: relative;
    }
    .radio-option input[type="radio"] {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }
    .radio-option label {
      display: block;
      padding: 10px 12px;
      text-align: center;
      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)));
      border-radius: 6px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-foreground);
      font-size: 0.9em;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .radio-option label:hover {
      border-color: var(--vscode-focusBorder);
    }
    .radio-option input[type="radio"]:checked + label {
      border-color: var(--vscode-button-background);
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .radio-option input[type="radio"]:focus + label {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .radio-description {
      font-size: 0.75em;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
      opacity: 0.9;
    }
    .radio-option input[type="radio"]:checked + label .radio-description {
      color: var(--vscode-button-foreground);
      opacity: 0.85;
    }
    .button-group {
      display: flex;
      gap: 12px;
      margin-top: 28px;
    }
    button {
      flex: 1;
      padding: 11px 18px;
      border: none;
      border-radius: 6px;
      font-size: var(--vscode-font-size);
      cursor: pointer;
      font-weight: 500;
      transition: background-color 0.15s ease;
    }
    button.primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.primary:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.4)));
    }
    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .error {
      color: var(--vscode-errorForeground);
      font-size: 0.85em;
      margin-top: 6px;
      display: none;
    }
    .error.visible {
      display: block;
    }
    .worktree-path {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
      margin-top: 8px;
      margin-left: 26px;
      display: none;
      word-break: break-all;
    }
    .worktree-path.visible {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-icon"><i class="codicon codicon-organization"></i></div>
      <h2>New Task</h2>
    </div>
    <form id="taskForm">
      <div class="form-group">
        <span class="form-group-label">Task Name</span>
        <input type="text" id="name" name="name" placeholder="e.g. fix-auth-bug" required>
        <div class="error" id="nameError">Task name is required</div>
      </div>

      <div class="form-group">
        <div class="checkbox-group">
          <div class="checkbox-row">
            <input type="checkbox" id="useWorktree" name="useWorktree">
            <label for="useWorktree">Create isolated git worktree</label>
          </div>
          <div class="worktree-path" id="worktreePath"></div>
        </div>
      </div>

      <div class="form-group">
        <span class="form-group-label">Model</span>
        <div class="radio-group">
          <div class="radio-option">
            <input type="radio" id="model-opus" name="model" value="opus"${model === 'opus' ? ' checked' : ''}>
            <label for="model-opus">Opus</label>
          </div>
          <div class="radio-option">
            <input type="radio" id="model-sonnet" name="model" value="sonnet"${model === 'sonnet' ? ' checked' : ''}>
            <label for="model-sonnet">Sonnet</label>
          </div>
          <div class="radio-option">
            <input type="radio" id="model-haiku" name="model" value="haiku"${model === 'haiku' ? ' checked' : ''}>
            <label for="model-haiku">Haiku</label>
          </div>
        </div>
      </div>

      <div class="form-group">
        <span class="form-group-label">Permission Mode</span>
        <div class="radio-group">
          <div class="radio-option">
            <input type="radio" id="perm-plan" name="permissionMode" value="plan"${perm === 'plan' ? ' checked' : ''}>
            <label for="perm-plan">
              Plan
              <div class="radio-description">Ask first</div>
            </label>
          </div>
          <div class="radio-option">
            <input type="radio" id="perm-autoEdit" name="permissionMode" value="autoEdit"${perm === 'autoEdit' ? ' checked' : ''}>
            <label for="perm-autoEdit">
              Auto Edit
              <div class="radio-description">Auto edits</div>
            </label>
          </div>
          <div class="radio-option">
            <input type="radio" id="perm-fullAuto" name="permissionMode" value="fullAuto"${perm === 'fullAuto' ? ' checked' : ''}>
            <label for="perm-fullAuto">
              Full Auto
              <div class="radio-description">No prompts</div>
            </label>
          </div>
        </div>
      </div>

      <div class="button-group">
        <button type="button" class="secondary" id="cancelBtn">Cancel</button>
        <button type="submit" class="primary">Create Task</button>
      </div>
    </form>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('taskForm');
    const nameInput = document.getElementById('name');
    const nameError = document.getElementById('nameError');
    const cancelBtn = document.getElementById('cancelBtn');
    const useWorktreeCheckbox = document.getElementById('useWorktree');
    const worktreePathEl = document.getElementById('worktreePath');
    const worktreeBasePath = '${this._worktreeBasePath}';

    // Focus the name input on load
    requestAnimationFrame(() => nameInput.focus());

    function slugify(text) {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    }

    function updateWorktreePath() {
      if (!useWorktreeCheckbox.checked) {
        worktreePathEl.classList.remove('visible');
        return;
      }
      const name = nameInput.value.trim();
      if (!name) {
        worktreePathEl.textContent = worktreeBasePath + '/<task-name>-xxxx/';
      } else {
        const slug = slugify(name);
        worktreePathEl.textContent = worktreeBasePath + '/' + slug + '-xxxx/';
      }
      worktreePathEl.classList.add('visible');
    }

    useWorktreeCheckbox.addEventListener('change', updateWorktreePath);
    nameInput.addEventListener('input', updateWorktreePath);

    function getSelectedRadio(name) {
      const selected = document.querySelector('input[name="' + name + '"]:checked');
      return selected ? selected.value : null;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = nameInput.value.trim();
      if (!name) {
        nameError.classList.add('visible');
        nameInput.focus();
        return;
      }
      nameError.classList.remove('visible');

      vscode.postMessage({
        command: 'submit',
        data: {
          name: name,
          useWorktree: document.getElementById('useWorktree').checked,
          model: getSelectedRadio('model'),
          permissionMode: getSelectedRadio('permissionMode')
        }
      });
    });

    nameInput.addEventListener('input', () => {
      nameError.classList.remove('visible');
    });

    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'cancel' });
    });
  </script>
</body>
</html>`;
  }
}
