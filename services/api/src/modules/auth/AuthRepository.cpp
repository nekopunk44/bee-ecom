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
}
