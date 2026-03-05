import * as vscode from 'vscode';
import { PermissionMode, Model } from '../types';
import { getNewTaskHtml } from './newTaskTemplate';

export interface NewTaskFormData {
  name: string;
  useWorktree: boolean;
  model: Model;
  permissionMode: PermissionMode;
}

export class NewTaskPanel {
  public static currentPanel: NewTaskPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static show(
    _extensionUri: vscode.Uri,
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

    NewTaskPanel.currentPanel = new NewTaskPanel(panel);
    NewTaskPanel.currentPanel._panel.webview.html = getNewTaskHtml({
      model: defaultModel,
      permissionMode: defaultPermissionMode,
      worktreeBasePath,
    });

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
}
