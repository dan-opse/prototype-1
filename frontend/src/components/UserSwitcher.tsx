import { useState } from 'react';
import { useUser } from '../state/UserContext';

export function UserSwitcher() {
  const { users, currentUser, selectUser, createUser, refresh } = useUser();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the new diner a name');
      return;
    }
    try {
      await createUser(trimmed);
      await refresh();
      setName('');
      setCreating(false);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create that user');
    }
  }

  return (
    <div className="user-switcher">
      {creating ? (
        <form className="user-switcher__form" onSubmit={handleCreate}>
          <input
            autoFocus
            className="input"
            placeholder="New diner's name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="button button--primary" type="submit">
            Create
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              setCreating(false);
              setError(null);
            }}
          >
            Cancel
          </button>
          {error && <span className="user-switcher__error">{error}</span>}
        </form>
      ) : (
        <>
          <label className="user-switcher__label" htmlFor="user-select">
            Viewing as
          </label>
          <select
            id="user-select"
            className="select"
            value={currentUser?.id ?? ''}
            onChange={(event) => selectUser(Number(event.target.value))}
          >
            <option value="" disabled>
              Choose a diner
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.display_name}
                {user.log_count ? ` (${user.log_count} logs)` : ' (no logs)'}
              </option>
            ))}
          </select>
          <button className="button button--ghost" type="button" onClick={() => setCreating(true)}>
            New diner
          </button>
        </>
      )}
    </div>
  );
}
