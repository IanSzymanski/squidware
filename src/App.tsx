import { useState } from 'react';
import { EditorProvider } from './editor/react';
import { createEditorStore, recoverProject } from './editor/store';
import { EditorShell } from './editor/EditorShell';

export default function App() {
  const [store] = useState(() => {
    const recovery = recoverProject(() => window.localStorage);
    return createEditorStore(recovery.project, recovery.recoveryError);
  });
  return <EditorProvider store={store}><EditorShell /></EditorProvider>;
}
