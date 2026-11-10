import { useState } from 'react';
import { EditorProvider } from './editor/react';
import { createEditorStore } from './editor/store';
import { markProductionClean } from './editor/fileSession';
import { createStartupProject } from './demoShow';
import { EditorShell } from './editor/EditorShell';
import { ShowAnalysisProvider } from './editor/ShowAnalysis';

export default function App() {
  // The startup demo has nothing to lose until its first edit; it still needs a Save As destination.
  const [store] = useState(() => { const created = createEditorStore(createStartupProject()); markProductionClean(created); return created; });
  return <EditorProvider store={store}><ShowAnalysisProvider><EditorShell /></ShowAnalysisProvider></EditorProvider>;
}
