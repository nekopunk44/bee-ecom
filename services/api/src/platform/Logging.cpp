#include "Logging.hpp"
#include <trantor/utils/Date.h>
#include <iostream>
#include <syncstream>

namespace bee {
void log(std::string_view service, std::string_view level, std::string_view event, Json::Value fields) {
    fields["timestamp"] = trantor::Date::now().toFormattedString(false) + "Z";
    fields["service"] = std::string(service);
    fields["level"] = std::string(level);
    fields["event"] = std::string(event);
    Json::StreamWriterBuilder writer;
    writer["indentation"] = "";
    std::osyncstream(std::cout) << Json::writeString(writer, fields) << '\n';
}
} // namespace bee
