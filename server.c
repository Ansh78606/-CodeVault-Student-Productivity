/*
 * CodeVault minimal C HTTP server
 * POSIX sockets: Linux/macOS. Serves static files and a tiny JSON task API.
 * For learning/demo use only; not intended for public internet deployment.
 */
#define _POSIX_C_SOURCE 200809L
#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#define PORT 8080
#define BUFFER_SIZE 65536
#define BODY_LIMIT 50000

static char *find_case_insensitive(char *haystack, const char *needle) {
    size_t n = strlen(needle);
    if (!n) return haystack;
    for (char *p = haystack; *p; ++p) {
        size_t i = 0;
        while (i < n && p[i] && tolower((unsigned char)p[i]) == tolower((unsigned char)needle[i])) ++i;
        if (i == n) return p;
    }
    return NULL;
}

static const char *root_dir = ".";
static void send_response(int client, int status, const char *status_text, const char *type, const char *body) {
    char header[512];
    size_t body_len = strlen(body);
    int n = snprintf(header, sizeof(header),
        "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\n"
        "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n",
        status, status_text, type, body_len);
    (void)send(client, header, (size_t)n, 0);
    (void)send(client, body, body_len, 0);
}
static void serve_file(int client, const char *path) {
    char full[1024];
    if (snprintf(full, sizeof(full), "%s%s", root_dir, path) >= (int)sizeof(full)) {
        send_response(client, 414, "URI Too Long", "text/plain", "URI too long"); return;
    }
    struct stat st;
    if (stat(full, &st) != 0 || !S_ISREG(st.st_mode)) {
        send_response(client, 404, "Not Found", "text/plain; charset=utf-8", "Not found"); return;
    }
    FILE *f = fopen(full, "rb");
    if (!f) { send_response(client, 500, "Internal Server Error", "text/plain", "Could not open file"); return; }
    const char *type = "application/octet-stream";
    if (strstr(full, ".html")) type = "text/html; charset=utf-8";
    else if (strstr(full, ".css")) type = "text/css; charset=utf-8";
    else if (strstr(full, ".js")) type = "application/javascript; charset=utf-8";
    else if (strstr(full, ".json")) type = "application/json; charset=utf-8";
    char header[512];
    snprintf(header, sizeof(header), "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %ld\r\nConnection: close\r\n\r\n", type, (long)st.st_size);
    (void)send(client, header, strlen(header), 0);
    char chunk[4096]; size_t n;
    while ((n = fread(chunk, 1, sizeof(chunk), f)) > 0) {
        if (send(client, chunk, n, 0) < 0) break;
    }
    fclose(f);
}
static void handle_client(int client) {
    char request[BUFFER_SIZE + 1];
    ssize_t got = recv(client, request, BUFFER_SIZE, 0);
    if (got <= 0) return;
    request[got] = '\0';
    char method[8] = {0}, path[512] = {0};
    if (sscanf(request, "%7s %511s", method, path) != 2) {
        send_response(client, 400, "Bad Request", "text/plain", "Bad request"); return;
    }
    if (strcmp(method, "OPTIONS") == 0) {
        send_response(client, 204, "No Content", "text/plain", ""); return;
    }
    if (strcmp(path, "/api/tasks") == 0) {
        if (strcmp(method, "GET") == 0) {
            FILE *f = fopen("tasks.json", "rb");
            if (!f) { send_response(client, 200, "OK", "application/json", "[]"); return; }
            char data[BODY_LIMIT + 1]; size_t n = fread(data, 1, BODY_LIMIT, f); fclose(f); data[n] = '\0';
            send_response(client, 200, "OK", "application/json; charset=utf-8", data); return;
        }
        if (strcmp(method, "POST") == 0) {
            char *body = strstr(request, "\r\n\r\n");
            if (!body) { send_response(client, 400, "Bad Request", "text/plain", "Missing body"); return; }
            body += 4;
            size_t len = (size_t)(request + got - body);
            char *cl = find_case_insensitive(request, "Content-Length:");
            if (cl) { long declared = strtol(cl + 15, NULL, 10); if (declared >= 0 && declared < BODY_LIMIT && (size_t)declared < len) len = (size_t)declared; }
            if (len > BODY_LIMIT) { send_response(client, 413, "Payload Too Large", "text/plain", "Task payload too large"); return; }
            FILE *f = fopen("tasks.json.tmp", "wb");
            if (!f) { send_response(client, 500, "Internal Server Error", "text/plain", "Cannot save tasks"); return; }
            fwrite(body, 1, len, f); fclose(f);
            if (rename("tasks.json.tmp", "tasks.json") != 0) { send_response(client, 500, "Internal Server Error", "text/plain", "Cannot update tasks"); return; }
            send_response(client, 200, "OK", "application/json", "{\"saved\":true}"); return;
        }
        send_response(client, 405, "Method Not Allowed", "text/plain", "Method not allowed"); return;
    }
    if (strcmp(method, "GET") != 0) { send_response(client, 405, "Method Not Allowed", "text/plain", "Only GET is supported for files"); return; }
    if (strstr(path, "..") || strchr(path, '\\')) { send_response(client, 400, "Bad Request", "text/plain", "Invalid path"); return; }
    if (strcmp(path, "/") == 0) strcpy(path, "/index.html");
    serve_file(client, path);
}
int main(void) {
    signal(SIGPIPE, SIG_IGN);
    int server = socket(AF_INET, SOCK_STREAM, 0);
    if (server < 0) { perror("socket"); return 1; }
    int opt = 1; setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    struct sockaddr_in address; memset(&address, 0, sizeof(address));
    address.sin_family = AF_INET; address.sin_addr.s_addr = htonl(INADDR_ANY); address.sin_port = htons(PORT);
    if (bind(server, (struct sockaddr *)&address, sizeof(address)) < 0) { perror("bind"); close(server); return 1; }
    if (listen(server, 16) < 0) { perror("listen"); close(server); return 1; }
    printf("CodeVault running at http://localhost:%d\nPress Ctrl+C to stop.\n", PORT);
    while (1) {
        int client = accept(server, NULL, NULL);
        if (client < 0) { if (errno == EINTR) continue; perror("accept"); continue; }
        handle_client(client); close(client);
    }
    close(server); return 0;
}
