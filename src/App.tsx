import { useState } from 'react';
import { EditorProvider } from './editor/react';
import { createEditorStore } from './editor/store';
import { createDemoProject } from './domain';
import { EditorShell } from './editor/EditorShell';

export default function App() {
  const [store] = useState(() => createEditorStore(createDemoProject()));
  return <EditorProvider store={store}><EditorShell /></EditorProvider>;
}
