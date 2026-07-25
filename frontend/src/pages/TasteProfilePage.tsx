import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useUser } from '../state/UserContext';
import type { PreferenceEntry, TasteProfile, TasteProfileSummary } from '../types';

interface Group {
  title: string;
  entries: PreferenceEntry[];
}

function sortByStrength(entries: Record<string, PreferenceEntry>): PreferenceEntry[] {
  return Object.values(entries).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}

function PreferenceBar({ entry }: { entry: PreferenceEntry }) {
  const magnitude = Math.min(Math.abs(entry.score), 1) * 100;
  const positive = entry.score >= 0;
  return (
    <li className="preference">
      <span className="preference__label">{entry.label}</span>
      <span className="preference__track">
        <span
          className={`preference__fill ${positive ? 'is-positive' : 'is-negative'}`}
          style={{ width: `${Math.max(magnitude, 4)}%` }}
        />
      </span>
      <span className="preference__score">{entry.score >= 0 ? `+${entry.score.toFixed(2)}` : entry.score.toFixed(2)}</span>
    </li>
  );
}

function GroupList({ groups }: { groups: Group[] }) {
  const populated = groups.filter((group) => group.entries.length > 0);
  if (populated.length === 0) {
    return <p className="muted">Nothing here yet.</p>;
  }
  return (
    <>
      {populated.map((group) => (
        <div key={group.title} className="profile-group">
          <h3 className="profile-group__title">{group.title}</h3>
          <ul className="preference-list">
            {group.entries.map((entry) => (
              <PreferenceBar key={`${group.title}-${entry.label}`} entry={entry} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function summaryGroups(side: TasteProfileSummary['liked']): Group[] {
  return [
    { title: 'Cuisines', entries: side.cuisines },
    { title: 'Price', entries: side.price_levels },
    { title: 'Spice', entries: side.spice_levels },
    { title: 'Vegetarian', entries: side.vegetarian },
    { title: 'Taste tags', entries: side.tags },
  ];
}

function confidenceGroups(profile: TasteProfile, confidence: 'confident' | 'still_learning'): Group[] {
  const allGroups: Group[] = [
    { title: 'Cuisines', entries: sortByStrength(profile.cuisines) },
    { title: 'Price', entries: sortByStrength(profile.price_levels) },
    { title: 'Spice', entries: sortByStrength(profile.spice_levels) },
    { title: 'Vegetarian', entries: sortByStrength(profile.vegetarian) },
    { title: 'Taste tags', entries: sortByStrength(profile.tags) },
  ];

  return allGroups.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => entry.confidence === confidence),
  }));
}

export function TasteProfilePage() {
  const { currentUser } = useUser();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [summary, setSummary] = useState<TasteProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getTasteProfile(currentUser.id)
      .then((response) => {
        setProfile(response.profile);
        setSummary(response.summary);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load your profile'))
      .finally(() => setLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return <EmptyState title="Pick a diner first" hint="Choose or create a diner above to see a taste profile." />;
  }
  if (loading) return <Loading label="Reading your history…" />;
  if (error) return <ErrorState message={error} />;
  if (!profile || !summary) return null;

  const confident = confidenceGroups(profile, 'confident');
  const learning = confidenceGroups(profile, 'still_learning');
  const nothingYet = profile.log_count === 0 && profile.swipe_count === 0;

  return (
    <section>
      <header className="page-head">
        <h1>{currentUser.display_name}'s taste profile</h1>
        <p className="page-head__sub">
          Built from {profile.log_count} logged meal{profile.log_count === 1 ? '' : 's'} and {profile.swipe_count}{' '}
          quiz answer{profile.swipe_count === 1 ? '' : 's'}. Right now taste tags carry{' '}
          {Math.round(profile.tag_weight * 100)}% of your match score and structural traits carry{' '}
          {Math.round(profile.structural_weight * 100)}%.
        </p>
      </header>

      {nothingYet && (
        <EmptyState
          title="No signal yet"
          hint="Take the taste quiz or log a meal, and this page fills in."
        />
      )}

      {!nothingYet && (
        <>
          <div className="profile-columns profile-columns--likes">
            <div className="profile-column profile-column--confident">
              <header className="profile-column__head">
                <h2>Frequently liked</h2>
                <p>Patterns where your score is clearly positive.</p>
              </header>
              <GroupList groups={summaryGroups(summary.liked)} />
            </div>

            <div className="profile-column profile-column--learning">
              <header className="profile-column__head">
                <h2>Frequently disliked</h2>
                <p>Patterns where your score is clearly negative.</p>
              </header>
              <GroupList groups={summaryGroups(summary.disliked)} />
            </div>
          </div>

          <div className="profile-columns">
            <div className="profile-column profile-column--confident">
              <header className="profile-column__head">
                <h2>Confident</h2>
                <p>Backed by meals you actually logged.</p>
              </header>
              <GroupList groups={confident} />
            </div>

            <div className="profile-column profile-column--learning">
              <header className="profile-column__head">
                <h2>Still learning</h2>
                <p>Early guesses from your quiz answers. Logging real meals will confirm or overwrite these.</p>
              </header>
              <GroupList groups={learning} />
            </div>
          </div>
        </>
      )}

      <div className="profile-actions">
        <Link className="button button--primary" to="/log">
          Log a meal
        </Link>
        <Link className="button button--ghost" to="/onboarding">
          Taste quiz
        </Link>
      </div>
    </section>
  );
}
