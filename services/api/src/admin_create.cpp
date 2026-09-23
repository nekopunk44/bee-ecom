#include "modules/auth/Auth.hpp"
#include "platform/Config.hpp"
#include "platform/Json.hpp"
#include <sodium.h>
#include <iostream>
#include <algorithm>

// Input is one JSON document on stdin, never a command-line password.
int main() {
    trantor::Logger::setLogLevel(trantor::Logger::kFatal);
    try {
        if(sodium_init()<0) return 1;
        const auto config=bee::Config::fromEnvironment();
        std::string line; std::getline(std::cin,line);
        auto body=bee::decode(line);
        auto email=body["email"].asString(); auto password=body["password"].asString();
        if(email.empty() || email.size()>254 || email.find('@')==std::string::npos || password.size()<12 || password.size()>256)
            throw std::invalid_argument("Invalid provisioning input");
        std::transform(email.begin(),email.end(),email.begin(),[](unsigned char c){ return static_cast<char>(std::tolower(c)); });
        auto db=drogon::orm::DbClient::newPgClient(config.postgresConnection,1); db->setTimeout(5);
        db->execSqlSync(R"SQL(
          WITH created AS (INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id)
          INSERT INTO user_roles(user_id,role_code) SELECT id,'ADMIN' FROM created
        )SQL",email,bee::auth::hashPassword(password));
        sodium_memzero(password.data(),password.size()); sodium_memzero(line.data(),line.size());
        std::cout << "Administrator created\n";
    } catch(const std::exception&) { std::cerr << "Administrator creation failed; check input, migrations and duplicate email\n"; return 1; }
}
