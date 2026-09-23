#pragma once
#include <json/json.h>
#include <sstream>
#include <stdexcept>

namespace bee {
inline std::string encode(const Json::Value& value) {
    Json::StreamWriterBuilder writer; writer["indentation"] = "";
    return Json::writeString(writer, value);
}
inline Json::Value decode(const std::string& text) {
    Json::CharReaderBuilder reader;
    Json::Value value;
    std::string errors;
    std::istringstream stream(text);
    if (!Json::parseFromStream(reader, stream, &value, &errors)) throw std::runtime_error("Invalid JSON");
    return value;
}
}
