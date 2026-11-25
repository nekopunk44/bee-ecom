#include "AuthRepository.hpp"

namespace bee::auth {
drogon::orm::Result Repository::principal(const std::string& hash) const {
    return db_->execSqlSync(R"SQL(
        SELECT u.id::text, u.email, COALESCE(jsonb_agg(DISTINCT rp.permission_code)
          FILTER (WHERE rp.permission_code IS NOT NULL),'[]')::text AS permissions
        FROM sessions s JOIN users u ON u.id=s.user_id
        LEFT JOIN user_roles ur ON ur.user_id=u.id
        LEFT JOIN role_permissions rp ON rp.role_code=ur.role_code
        WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active GROUP BY u.id
    )SQL",hash);
}
drogon::orm::Result Repository::credentials(const std::string& email) const {
    return db_->execSqlSync("SELECT id::text,password_hash,active FROM users WHERE email=$1",email);
}
drogon::orm::Result Repository::registerCustomer(const std::string& email,
                                                 const std::string& passwordHash,
                                                 const std::string& tokenHash) const {
    return db_->execSqlSync(R"SQL(
        WITH inserted AS (
            INSERT INTO users(email, password_hash) VALUES($1, $2)
            ON CONFLICT (email) DO NOTHING
            RETURNING id, email
        ), assigned AS (
            INSERT INTO user_roles(user_id, role_code)
            SELECT id, 'CUSTOMER' FROM inserted
        ), session AS (
            INSERT INTO sessions(token_hash, user_id, expires_at)
            SELECT $3, id, now() + interval '30 minutes' FROM inserted
        )
        SELECT id::text, email FROM inserted
    )SQL", email, passwordHash, tokenHash);
}
int Repository::consumeAttempt(const std::string& hash) const {
    const auto rows=db_->execSqlSync(R"SQL(
      INSERT INTO auth_throttles(key_hash,attempts,resets_at) VALUES($1,1,now()+interval '15 minutes')
      ON CONFLICT(key_hash) DO UPDATE SET
        attempts=CASE WHEN auth_throttles.resets_at<=now() THEN 1 ELSE auth_throttles.attempts+1 END,
        resets_at=CASE WHEN auth_throttles.resets_at<=now() THEN now()+interval '15 minutes' ELSE auth_throttles.resets_at END
      RETURNING attempts
    )SQL",hash);
    return rows[0]["attempts"].as<int>();
}
void Repository::createSession(const std::string& hash,const std::string& user) const {
    db_->execSqlSync("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2::uuid,now()+interval '30 minutes')",hash,user);
}
void Repository::revoke(const std::string& hash) const {
    db_->execSqlSync("DELETE FROM sessions WHERE token_hash=$1",hash);
}
drogon::orm::Result Repository::googleUser(const std::string& subject, const std::string& email) const {
    // Known Google subject first; otherwise a customer account with the same verified
    // email is linked, or a new customer is created. Staff accounts are never joined
    // by email: they keep signing in with a password. "!external" never verifies.
    return db_->execSqlSync(R"SQL(
        WITH known AS (
            SELECT u.id, u.email, u.active FROM user_identities i JOIN users u ON u.id = i.user_id
            WHERE i.provider = 'google' AND i.subject = $1
        ), by_email AS (
            SELECT u.id, u.email, u.active FROM users u
            WHERE u.email = $2 AND NOT EXISTS (SELECT 1 FROM known)
              AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role_code <> 'CUSTOMER')
        ), created AS (
            INSERT INTO users(email, password_hash)
            SELECT $2, '!external'
            WHERE NOT EXISTS (SELECT 1 FROM known) AND NOT EXISTS (SELECT 1 FROM users WHERE email = $2)
            RETURNING id, email, active
        ), assigned AS (
            INSERT INTO user_roles(user_id, role_code) SELECT id, 'CUSTOMER' FROM created
        ), chosen AS (
            SELECT * FROM known UNION ALL SELECT * FROM by_email UNION ALL SELECT * FROM created
        ), linked AS (
            INSERT INTO user_identities(provider, subject, user_id)
            SELECT 'google', $1, id FROM chosen ON CONFLICT (provider, subject) DO NOTHING
        )
        SELECT id::text, email, active FROM chosen
    )SQL", subject, email);
}
}
