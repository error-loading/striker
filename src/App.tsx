import { useEffect } from 'react';
import { audio } from './audio/audio';
import { useGame } from './store/gameStore';
import LandingPage from './screens/LandingPage';
import SquadBuilder from './screens/SquadBuilder';
import MatchSetup from './screens/MatchSetup';
import PreMatch from './screens/PreMatch';
import MatchScreen from './screens/MatchScreen';
import HalfTime from './screens/HalfTime';
import FullTime from './screens/FullTime';
import SettingsScreen from './screens/SettingsScreen';
import AboutScreen from './screens/AboutScreen';

export default function App() {
  const screen = useGame((s) => s.screen);
  const settings = useGame((s) => s.settings);

  // The audio context can only start from a user gesture.
  useEffect(() => {
    const unlock = () => {
      audio.init();
      audio.setEnabled(settings.audioEnabled);
      audio.setVolumes({
        master: settings.masterVolume,
        music: settings.musicVolume,
        sfx: settings.sfxVolume,
        crowd: settings.crowdVolume,
      });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [settings]);

  useEffect(() => {
    audio.setEnabled(settings.audioEnabled);
    audio.setVolumes({
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
      crowd: settings.crowdVolume,
    });
  }, [settings]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-navy-950 text-white">
      <div key={screen} className="h-full w-full animate-fadeIn">
        {screen === 'landing' && <LandingPage />}
        {screen === 'squad' && <SquadBuilder />}
        {screen === 'setup' && <MatchSetup />}
        {screen === 'prematch' && <PreMatch />}
        {screen === 'match' && <MatchScreen />}
        {screen === 'halftime' && <HalfTime />}
        {screen === 'fulltime' && <FullTime />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'about' && <AboutScreen />}
      </div>
    </div>
  );
}
