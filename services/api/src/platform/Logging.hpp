#pragma once
#include <json/json.h>
#include <string_view>

namespace bee {
void log(std::string_view service, std::string_view level, std::string_view event,
         Json::Value fields = Json::Value(Json::objectValue));
}
