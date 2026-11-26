-- Sign-in with an outside provider (Google for now). The account is found by the
-- provider's stable subject, not by the email address, which the person may change.
-- Accounts created this way get an unusable password marker instead of a hash.
CREATE TABLE user_identities (
    provider text NOT NULL CHECK (provider IN ('google')),
    subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);
CREATE INDEX user_identities_user_idx ON user_identities(user_id);
