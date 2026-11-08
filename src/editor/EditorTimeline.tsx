import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';
import { compileScore, scoreLabel, scorePosition } from '../score';
import './score.css';
import { timelineReadout, transportCount, formatTimelineCount as fmt } from './timelineNavigation';
import { TimelineTracks } from './TimelineTracks';


import { Bookmark, AudioLines, ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ChevronRight, LoaderCircle, Timer, Pause, Play, Repeat2, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

import { HelpButton } from './ControlHelp';
import { Tooltip } from '../components/Tooltip';
import { Button } from './EditorControls';
import { OverflowMenu } from './OverflowMenu';
import type { TransportMode } from './breakpoints';

import { activePassage, resolvePassage } from '../rehearsal';
import { useEditorSelector } from './react';
import { isModalOpen } from './confirmation';
import type { EditorController } from './useEditorController';

/** Transport options in order, More playback options among them when it is shown. */
const OPTIONS = '.timeline .transport-options [aria-label]';
/** `transport` comes from the shared breakpoints: compact moves loop, metronome and speed into More playback options;
 * narrow also moves rehearsal passages and audio. Play, set navigation and the show count always stay on one row. */
export function EditorTimeline({ controller, transport = 'full' }: { controller: EditorController; transport?: TransportMode }) {
  const { project, playing, loop, setLoop, speed, setSpeed, metronome, audioName, audioLoading, muted, setMuted, index, duration, selectSet, togglePlay } = controller;
  const count = useEditorSelector(state => state.playback.count);
  const clockStatus = useEditorSelector(state => state.playback.clockStatus);
  const rehearsalId = useEditorSelector(state => state.playback.rehearsalId);
  const passage = activePassage(project, rehearsalId), resolved = passage ? resolvePassage(project, passage) : undefined;
  const position = timelineReadout(project, count), shown = transportCount(position.count, playing);
  const score = useMemo(()=>compileScore(project),[project]), musical = scorePosition(score,shown);
  const rehearsal = <Button command="rehearsal.open" title="Rehearsal passages" active={!!passage} onClick={() => controller.dispatch('rehearsal.open')}><Bookmark size={16} /><span className="overflow-option-label">Rehearsal passages</span></Button>, audio = <HelpButton title={audioName ? 'Replace audio' : 'Attach audio'} description="Choose a local audio file to accompany rehearsal playback." disabledReason="Wait for the audio file to finish loading." className={`audio-attach ${audioName ? 'attached' : ''}`} onClick={() => void controller.chooseAudio()} disabled={audioLoading || !!controller.fileOperation}>{audioLoading ? <LoaderCircle size={14} className="spin" /> : <AudioLines size={14} />}<span className="audio-file-label">{audioName || 'Attach audio'}</span>{audioName && <span>Replace</span>}</HelpButton>, loopButton = <Button title={resolved?.end ? "Loop range" : "Loop show"} description={resolved?.end ? "Repeat the active count range using the shared audio clock." : "Restart from the opening set when playback reaches the end."} active={loop} onClick={() => setLoop(!loop)}><Repeat2 size={17} /><span className="overflow-option-label">{resolved?.end ? 'Loop range' : 'Loop show'}</span></Button>, metronomeButton = <Button title="Metronome" command="metronome.toggle" description="Toggle meter-aware clicks. Configure meter and count-in in Production settings or the Command palette." active={metronome} onClick={() => controller.dispatch('metronome.toggle')}><Timer size={17} /><span className="overflow-option-label">Metronome</span></Button>, speedSelect = <label className="transport-speed"><span className="overflow-option-label">Speed</span><Tooltip name="Playback speed" description="Change rehearsal speed without changing the written move tempos." state={`${speed}×`}><select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></Tooltip></label>;
  // Stable keys: a tier change never turns one folded control's node into another, focused or not.
  const folded = (transport === 'full' ? [] : transport === 'compact' ? ['loop', 'metronome', 'speed'] : ['rehearsal', 'audio', 'loop', 'metronome', 'speed']).map(key => <Fragment key={key}>{{ rehearsal, audio, loop: loopButton, metronome: metronomeButton, speed: speedSelect }[key]}</Fragment>);
  // A tier change (a resize, a UI scale change or a panel docking beside the field) moves options between the transport
  // and More playback options, also under a dialog (a confirmation included) opened from one. Focus on a moved option
  // then follows it to where it is now, or to More when it is folded away, instead of falling to the page; focus on More
  // itself, when a wider tier removes it, moves to the first option that left the menu, now in More's place. Only focus
  // held as the change renders counts: each render while no dialog is shown notes the focused option (a tier change and
  // an opening dialog render here before their commit), and a shown dialog keeps the option it opened from. Focus that
  // left for the page stays.
  const moving = useRef<{ modal: boolean; node: Element | null; at: number }>({ modal: false, node: null, at: -1 }), focus = document.activeElement;
  if (!moving.current.modal) {
    const node = moving.current.node = focus?.closest('.timeline .transport-options') ? focus : null;
    moving.current.at = node?.matches('.overflow-menu-trigger') ? [...document.querySelectorAll(OPTIONS)].indexOf(node) : -1;
  }
  const modal = useEditorSelector(state => isModalOpen(state) || state.ui.paletteOpen);
  useLayoutEffect(() => {
    const { node, at } = moving.current, label = node?.getAttribute('aria-label');
    moving.current.modal = modal;
    if (modal || !label || node?.isConnected || document.activeElement !== document.body) return;
    moving.current.node = null;
    const options = [...document.querySelectorAll<HTMLElement>(OPTIONS)];
    (options.find(node => node.getAttribute('aria-label') === label) ?? options.find(node => node.getAttribute('aria-label') === 'More playback options') ?? options[at])?.focus();
  }, [modal, transport]);
  return (<section className="timeline" aria-label="Show timeline">{passage && resolved && <div className="rehearsal-status" role="status"><span><strong>{passage.name}</strong> · {resolved.end ? `Counts ${resolved.start.count}–${resolved.end.count}` : `Bookmark ${resolved.start.count}`} · {resolved.focus.label} · {resolved.focus.ids.length} on field{passage.notes ? ` · ${passage.notes}` : ''}</span><button className="button subtle" onClick={() => controller.dispatch('rehearsal.clear')}>Full show</button></div>}{controller.portableAudio.audioWarning && <div className="rehearsal-status" role="status"><span>{controller.portableAudio.audioWarning}</span><button className="button subtle" disabled={audioLoading || !!controller.fileOperation} onClick={() => void controller.chooseAudio()}>Relink audio</button></div>}<TimelineTracks controller={controller} />
            <div className="transport"><div className="transport-options">{transport !== 'narrow' && <>{rehearsal}{audio}</>}{transport === 'full' && <>{loopButton}{metronomeButton}{speedSelect}</>}{folded.length > 0 && <OverflowMenu title="More playback options" description={transport === 'compact' ? 'Loop, metronome and playback speed. A wider window shows them in the transport.' : 'Rehearsal passages, audio, loop, metronome and playback speed. A wider window shows them in the transport.'} placement="above">{folded}</OverflowMenu>}</div><div className="play-controls"><Button command="set.select" showShortcut={false} title="First set" className="timeline-edge-set" description="Stop playback and return to the opening set." onClick={() => selectSet(0)}><ArrowLeftToLine size={17} /></Button><Button command="set.select" shortcutVariant={0} title="Previous set" disabled={index === 0} disabledReason="This is already the first set." onClick={() => selectSet(index - 1)}><SkipBack size={17} /></Button><Button command="playback.count-previous" title="Previous count" disabled={count <= 0} disabledReason="The opening set is count zero." onClick={() => controller.dispatch('playback.count-previous')}><ChevronLeft size={17} /></Button><HelpButton command="playback.toggle" title={playing ? 'Pause playback' : 'Play show'} state={playing ? 'Playing' : 'Paused'} disabled={!duration} disabledReason="Add a second set with move counts to rehearse a transition." className="play-button" aria-label={playing ? 'Pause playback' : 'Play show'} onClick={togglePlay}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</HelpButton><Button command="playback.count-next" title="Next count" disabled={count >= duration} disabledReason="This is the final show count." onClick={() => controller.dispatch('playback.count-next')}><ChevronRight size={17} /></Button><Button command="set.select" shortcutVariant={1} title="Next set" disabled={index === project.sets.length - 1} disabledReason="This is already the last set." onClick={() => selectSet(index + 1)}><SkipForward size={17} /></Button><Button command="set.select" showShortcut={false} title="Last set" className="timeline-edge-set" description="Stop playback and arrive at the final set." onClick={() => selectSet(project.sets.length - 1)}><ArrowRightToLine size={17} /></Button></div><div className="count-display"><span className="move-count" title={position.name}><span className="move-heading"><span>{position.opening ? 'Opening · 01' : `${position.arrived ? 'At' : 'To'} set ${String(position.setIndex + 1).padStart(2, '0')}`}</span><small className="score-readout" aria-label="Score position" title={`${scoreLabel(score,shown)} · ${musical.meter.numerator}/${musical.meter.denominator}${musical.mark?` · ${musical.mark}`:''}`}>{scoreLabel(score,shown)}{musical.mark?` · ${musical.mark}`:''}</small></span><small role={(clockStatus.startsWith('Count-in') || clockStatus.startsWith('Fermata')) ? 'status' : undefined} aria-label={clockStatus.startsWith('Fermata')?clockStatus:undefined}>{clockStatus.startsWith('Fermata') ? `Hold · ${clockStatus.split(' · ').at(-1)?.replace(' remaining','')}` : clockStatus.startsWith('Count-in') ? clockStatus : clockStatus.startsWith('Metronome unavailable') ? 'Click unavailable' : position.opening ? 'Count 0' : `Move ${fmt(transportCount(position.localCount, playing))} / ${position.counts}`} </small></span><span className="show-count"><small>SHOW</small><strong>{fmt(transportCount(count, playing))}</strong><small>/ {duration}</small></span><Button title={muted ? 'Unmute audio' : 'Mute audio'} description="Mute or restore the attached rehearsal audio; metronome clicks are separate." state={muted ? 'Muted' : 'Audible'} active={muted} onClick={() => setMuted(!muted)}><>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</></Button></div></div>
          </section>);
}

EditorTimeline.displayName = 'EditorTimeline';
