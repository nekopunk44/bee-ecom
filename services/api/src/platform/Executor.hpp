#pragma once
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

namespace bee {
// Bounded execution queue, never used for durable business events.
class Executor {
public:
    explicit Executor(unsigned workers = 4) {
        for (unsigned i = 0; i < workers; ++i) workers_.emplace_back([this] {
            while (true) {
                std::function<void()> task;
                {
                    std::unique_lock lock(mutex_);
                    available_.wait(lock, [this] { return stopping_ || !queue_.empty(); });
                    if (queue_.empty() && stopping_) return;
                    task = std::move(queue_.front()); queue_.pop_front();
                }
                task();
            }
        });
    }
    ~Executor() {
        { std::lock_guard lock(mutex_); stopping_ = true; }
        available_.notify_all();
        for (auto& thread : workers_) thread.join();
    }
    bool submit(std::function<void()> task) {
        std::lock_guard lock(mutex_);
        if (stopping_ || queue_.size() >= 64) return false;
        queue_.push_back(std::move(task)); available_.notify_one(); return true;
    }
private:
    std::mutex mutex_;
    std::condition_variable available_;
    std::deque<std::function<void()>> queue_;
    std::vector<std::thread> workers_;
    bool stopping_ = false;
};
}
