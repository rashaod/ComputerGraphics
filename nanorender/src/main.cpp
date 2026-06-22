#include "MiniFB.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <vector>
#include <fstream>
#include <sstream>
#include <string>
#include <algorithm>

extern "C" {
#include "microui.h"
}
#include "ui_bridge.h"
#include "ui_renderer.h"

#define WIDTH 1000
#define HEIGHT 700

static uint32_t g_buffer[WIDTH * HEIGHT];
static float g_color_phase = 0.0f;
static float wave_freq = 0.02f;
static int waves_enabled = 1;
// Local transform controls
static glm::vec3 local_translation(0.0f);
static glm::vec3 local_rotation(0.0f);    // degrees
static glm::vec3 local_scale(1.0f);

// World transform controls
static glm::vec3 world_translation(0.0f);
static glm::vec3 world_rotation(0.0f);    // degrees
static glm::vec3 world_scale(1.0f);
struct Line { int x0, y0, x1, y1; uint32_t color; };
static Line g_lines[1000];
static int g_line_count = 0;

static bool g_is_dragging = false;
static int g_drag_start_x = 0, g_drag_start_y = 0;

static float draw_r = 255.0f, draw_g = 255.0f, draw_b = 255.0f;
void draw_line(int x0, int y0, int x1, int y1, uint32_t color) {
  int dx = abs(x1 - x0);
  int dy = -abs(y1 - y0);
  int sx = (x0 < x1) ? 1 : -1;
  int sy = (y0 < y1) ? 1 : -1;
  int err = dx + dy;

  int x = x0, y = y0;
  while (true) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      g_buffer[y * WIDTH + x] = color;
    }
    if (x == x1 && y == y1) break;
    int e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

struct Vertex { float x, y, z; };
struct Face { int v0, v1, v2; };

std::vector<Vertex> g_mesh_vertices;
struct Transform {
  float scale;
  glm::vec3 translate; // applied after scaling, to center on screen
};
Transform compute_normalize_transform(const std::vector<Vertex>& verts, float target_size) {
  glm::vec3 min_v(1e9f), max_v(-1e9f);
  for (const auto& v : verts) {
    min_v.x = std::min(min_v.x, v.x);
    min_v.y = std::min(min_v.y, v.y);
    min_v.z = std::min(min_v.z, v.z);
    max_v.x = std::max(max_v.x, v.x);
    max_v.y = std::max(max_v.y, v.y);
    max_v.z = std::max(max_v.z, v.z);
  }
  glm::vec3 extent = max_v - min_v;
  float largest_extent = std::max({extent.x, extent.y, extent.z});
  float scale = (largest_extent > 0.0001f) ? (target_size / largest_extent) : 1.0f;
  glm::vec3 center = (min_v + max_v) * 0.5f;
  Transform t;
  t.scale = scale;
  // After scaling by 'scale', the center should map to (0,0,0); we'll add the
  // screen-center offset later in the projection step.
  t.translate = -center * scale;
  return t;
}

struct Point2D { int x, y; };

Point2D project_vertex(const Vertex& v, const Transform& t) {
  // Apply normalization: scale + translate
  float wx = v.x * t.scale + t.translate.x;
  float wy = v.y * t.scale + t.translate.y;
  // Orthographic projection: drop Z, add screen center
  int sx = (int)(wx + WIDTH / 2.0f);
  int sy = (int)(-wy + HEIGHT / 2.0f); // flip Y (screen Y grows downward)
  return {sx, sy};
}

#include <glm/gtc/matrix_transform.hpp>

glm::mat4 build_transform(glm::vec3 translation, glm::vec3 rotation_deg, glm::vec3 scale) {
  glm::mat4 T = glm::translate(glm::mat4(1.0f), translation);
  glm::mat4 Rx = glm::rotate(glm::mat4(1.0f), glm::radians(rotation_deg.x), glm::vec3(1,0,0));
  glm::mat4 Ry = glm::rotate(glm::mat4(1.0f), glm::radians(rotation_deg.y), glm::vec3(0,1,0));
  glm::mat4 Rz = glm::rotate(glm::mat4(1.0f), glm::radians(rotation_deg.z), glm::vec3(0,0,1));
  glm::mat4 S = glm::scale(glm::mat4(1.0f), scale);
  return T * Rz * Ry * Rx * S;
}
std::vector<Face> g_mesh_faces;

bool load_obj(const std::string& path) {
  std::ifstream file(path);
  if (!file.is_open()) {
    printf("Failed to open OBJ file: %s\n", path.c_str());
    return false;
  }
  g_mesh_vertices.clear();
  g_mesh_faces.clear();

  std::string line;
  while (std::getline(file, line)) {
    std::istringstream ss(line);
    std::string prefix;
    ss >> prefix;

    if (prefix == "v") {
      Vertex v;
      ss >> v.x >> v.y >> v.z;
      g_mesh_vertices.push_back(v);
    } else if (prefix == "f") {
      int i0, i1, i2;
      ss >> i0 >> i1 >> i2;
      g_mesh_faces.push_back({i0 - 1, i1 - 1, i2 - 1});
    }
  }

  printf("Loaded OBJ: %zu vertices, %zu faces\n", g_mesh_vertices.size(), g_mesh_faces.size());
  return true;
}
int main() {
 // GLM test (Part 0) - confirm library works
  glm::vec3 test_vec(1.0f, 2.0f, 3.0f);
  glm::mat4 test_mat = glm::translate(glm::mat4(1.0f), glm::vec3(5.0f, 0.0f, 0.0f));
  glm::vec4 result = test_mat * glm::vec4(test_vec, 1.0f);
  printf("GLM test: translated vec3(1,2,3) by (5,0,0) -> (%.1f, %.1f, %.1f)\n", result.x, result.y, result.z);

  struct mfb_window *window =
      mfb_open_ex("MiniGUI Platform", WIDTH, HEIGHT, MFB_WF_RESIZABLE);
  if (!window)
    return 1;

  mu_Context *ctx = (mu_Context *)malloc(sizeof(mu_Context));
  mu_init(ctx);

  load_obj("assets/pyramid.obj");

  Transform norm_transform = compute_normalize_transform(g_mesh_vertices, 600.0f);
  printf("Normalize: scale=%.4f, translate=(%.2f, %.2f, %.2f)\n",
         norm_transform.scale, norm_transform.translate.x, norm_transform.translate.y, norm_transform.translate.z);

  // Set font callbacks for microui
  ctx->text_width = [](mu_Font font, const char *str, int len) {
    return (len < 0 ? (int)strlen(str) : len) * 8;
  };
  ctx->text_height = [](mu_Font font) { return 8; };

  UIRenderer renderer(WIDTH, HEIGHT);

  // Set up char input callback for textbox input
mfb_set_char_input_callback(
      [](struct mfb_window *w, unsigned int c) {
        if (c == 'c') {
          g_color_phase += 2.0f;  // shift colors on each press
          return; // consume the event, don't pass to UI
        }
        extern void ui_bridge_char_input(struct mfb_window *, unsigned int);
        ui_bridge_char_input(w, c);
      },
      window);

  while (mfb_update_events(window) != MFB_STATE_EXIT) {
    // 1. Input
    ui_bridge_input(ctx, window);
        // Line drawing input (Part 6)
    if (mfb_get_mouse_button_buffer(window)[MFB_MOUSE_LEFT] && !g_is_dragging && ctx->hover == 0) {
      g_is_dragging = true;
      g_drag_start_x = (int)ctx->mouse_pos.x;
      g_drag_start_y = (int)ctx->mouse_pos.y;
    }
    if (!mfb_get_mouse_button_buffer(window)[MFB_MOUSE_LEFT] && g_is_dragging) {
      g_is_dragging = false;
      if (g_line_count < 1000) {
        g_lines[g_line_count].x0 = g_drag_start_x;
        g_lines[g_line_count].y0 = g_drag_start_y;
        g_lines[g_line_count].x1 = (int)ctx->mouse_pos.x;
        g_lines[g_line_count].y1 = (int)ctx->mouse_pos.y;
       g_lines[g_line_count].color = MFB_RGB((uint8_t)draw_r, (uint8_t)draw_g, (uint8_t)draw_b);
        g_line_count++;
      }
    }

// 2. Scene Rendering (Background)
    for (int i = 0; i < WIDTH * HEIGHT; i++) {
      int x = i % WIDTH;
      int y = i / WIDTH;
      uint8_t r, g, b;
      if (waves_enabled) {
        r = (uint8_t)(128 + 127 * sinf((x + y) * wave_freq + g_color_phase));
        g = (uint8_t)(128 + 127 * sinf((x - y) * wave_freq + g_color_phase));
        b = 100;
      } else {
        r = g = b = 40; // flat dark gray when disabled
      }
      g_buffer[i] = MFB_RGB(r, g, b);
    }

    // Draw all permanent lines (Part 6)
    for (int li = 0; li < g_line_count; li++) {
      draw_line(g_lines[li].x0, g_lines[li].y0, g_lines[li].x1, g_lines[li].y1, g_lines[li].color);
    }

 // Draw live preview line while dragging
    if (g_is_dragging) {
      draw_line(g_drag_start_x, g_drag_start_y, (int)ctx->mouse_pos.x, (int)ctx->mouse_pos.y, MFB_RGB((uint8_t)draw_r, (uint8_t)draw_g, (uint8_t)draw_b));
    }

 // Draw wireframe mesh with transformations (Part 5)
    glm::mat4 M_local = build_transform(local_translation, local_rotation, local_scale);
    glm::mat4 M_world = build_transform(world_translation, world_rotation, world_scale);
    glm::mat4 M_final = M_world * M_local;

    for (const auto& face : g_mesh_faces) {
      // Get 3 vertices of this face
      Vertex v0 = g_mesh_vertices[face.v0];
      Vertex v1 = g_mesh_vertices[face.v1];
      Vertex v2 = g_mesh_vertices[face.v2];

      // Apply normalization first, then transformation matrix
      auto apply = [&](Vertex v) -> glm::vec4 {
        float nx = v.x * norm_transform.scale + norm_transform.translate.x;
        float ny = v.y * norm_transform.scale + norm_transform.translate.y;
        float nz = v.z * norm_transform.scale + norm_transform.translate.z;
        return M_final * glm::vec4(nx, ny, nz, 1.0f);
      };

      glm::vec4 t0 = apply(v0);
      glm::vec4 t1 = apply(v1);
      glm::vec4 t2 = apply(v2);

      // Orthographic projection: drop Z, add screen center
      int x0 = (int)(t0.x + WIDTH / 2.0f),  y0 = (int)(-t0.y + HEIGHT / 2.0f);
      int x1 = (int)(t1.x + WIDTH / 2.0f),  y1 = (int)(-t1.y + HEIGHT / 2.0f);
      int x2 = (int)(t2.x + WIDTH / 2.0f),  y2 = (int)(-t2.y + HEIGHT / 2.0f);

      draw_line(x0, y0, x1, y1, MFB_RGB(255, 255, 255));
      draw_line(x1, y1, x2, y2, MFB_RGB(255, 255, 255));
      draw_line(x2, y2, x0, y0, MFB_RGB(255, 255, 255));
    }
    
    // 3. UI Logic
    static float slider_val = 50.0f;
    static float number_val = 3.14f;
    static int checkbox_a = 0;
    static int checkbox_b = 1;
    static char textbox_buf[128] = "edit me";
    static bool quit_requested = false;
    static int show_secret = 0;

    mu_begin(ctx);

    // --- Widgets window ---
    if (mu_begin_window(ctx, "Widgets", mu_rect(20, 20, 360, 540))) {
      int w1[] = {-1};

      // label / text
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "Line color (R):");
      mu_slider(ctx, &draw_r, 0, 255);
      mu_label(ctx, "Line color (G):");
      mu_slider(ctx, &draw_g, 0, 255);
      mu_label(ctx, "Line color (B):");
      mu_slider(ctx, &draw_b, 0, 255);
      mu_label(ctx, "mu_label: plain static text");
      mu_text(ctx, "mu_text: word-wrapped longer text that will reflow inside "
                   "the window width automatically.");

                   mu_layout_row(ctx, 1, w1, 0);
      char mesh_info[64];
      snprintf(mesh_info, sizeof(mesh_info), "Mesh: %zu vertices, %zu faces", g_mesh_vertices.size(), g_mesh_faces.size());
      mu_label(ctx, mesh_info);
      // button
      mu_layout_row(ctx, 1, w1, 0);
      if (mu_button(ctx, "mu_button: click me")) {
        quit_requested = false; // just a reaction
      }

      // checkbox
      mu_layout_row(ctx, 1, w1, 0);
      mu_checkbox(ctx, "mu_checkbox A (off)", &checkbox_a);
      mu_checkbox(ctx, "mu_checkbox B (on)", &checkbox_b);

      mu_layout_row(ctx, 1, w1, 0);
      mu_checkbox(ctx, "Toggle secret message", &show_secret);
      if (show_secret) {
        mu_label(ctx, "You found the secret message!");
      } else {
       mu_label(ctx, "Check the box above...");
      }
      // wave pattern controls (Part 5)
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "Wave frequency:");
      mu_slider(ctx, &wave_freq, 0.001f, 0.1f);

      mu_layout_row(ctx, 1, w1, 0);
      mu_checkbox(ctx, "Enable wave pattern", &waves_enabled);
      // textbox
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "mu_textbox:");
      mu_textbox(ctx, textbox_buf, sizeof(textbox_buf));

      // slider
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "mu_slider (0-100):");
      mu_slider(ctx, &slider_val, 0, 100);

      // number
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "mu_number (step 0.1):");
      mu_number(ctx, &number_val, 0.1f);

      // header (collapsible section)
      if (mu_header(ctx, "mu_header: collapsible section")) {
        mu_layout_row(ctx, 1, w1, 0);
        mu_label(ctx, "Content inside the header.");
      }

      // treenode
      if (mu_begin_treenode(ctx, "mu_treenode: root")) {
        mu_layout_row(ctx, 1, w1, 0);
        mu_label(ctx, "child item A");
        if (mu_begin_treenode(ctx, "nested node")) {
          mu_layout_row(ctx, 1, w1, 0);
          mu_label(ctx, "deeply nested item");
          mu_end_treenode(ctx);
        }
        mu_end_treenode(ctx);
      }

      // quit button
      mu_layout_row(ctx, 1, w1, 0);
      if (mu_button(ctx, "Quit")) {
        quit_requested = true;
      }

      mu_end_window(ctx);
    }
    // --- Transform Controls window ---
    if (mu_begin_window(ctx, "Transform Controls", mu_rect(20, 300, 360, 500))) {
      int w[] = {-1};

      // Local Transforms
      mu_layout_row(ctx, 1, w, 0);
      mu_label(ctx, "--- Local Transforms ---");

      mu_label(ctx, "Local Translation:");
      mu_slider(ctx, &local_translation.x, -500.0f, 500.0f);
      mu_slider(ctx, &local_translation.y, -500.0f, 500.0f);
      mu_slider(ctx, &local_translation.z, -500.0f, 500.0f);

      mu_label(ctx, "Local Rotation (deg):");
      mu_slider(ctx, &local_rotation.x, -180.0f, 180.0f);
      mu_slider(ctx, &local_rotation.y, -180.0f, 180.0f);
      mu_slider(ctx, &local_rotation.z, -180.0f, 180.0f);

      mu_label(ctx, "Local Scale:");
      mu_slider(ctx, &local_scale.x, 0.1f, 5.0f);
      mu_slider(ctx, &local_scale.y, 0.1f, 5.0f);
      mu_slider(ctx, &local_scale.z, 0.1f, 5.0f);

      // World Transforms
      mu_layout_row(ctx, 1, w, 0);
      mu_label(ctx, "--- World Transforms ---");

      mu_label(ctx, "World Translation:");
      mu_slider(ctx, &world_translation.x, -500.0f, 500.0f);
      mu_slider(ctx, &world_translation.y, -500.0f, 500.0f);
      mu_slider(ctx, &world_translation.z, -500.0f, 500.0f);

      mu_label(ctx, "World Rotation (deg):");
      mu_slider(ctx, &world_rotation.x, -180.0f, 180.0f);
      mu_slider(ctx, &world_rotation.y, -180.0f, 180.0f);
      mu_slider(ctx, &world_rotation.z, -180.0f, 180.0f);

      mu_label(ctx, "World Scale:");
      mu_slider(ctx, &world_scale.x, 0.1f, 5.0f);
      mu_slider(ctx, &world_scale.y, 0.1f, 5.0f);
      mu_slider(ctx, &world_scale.z, 0.1f, 5.0f);

      mu_end_window(ctx);
    }

    // --- Panel window ---
    if (mu_begin_window(ctx, "Panel Demo", mu_rect(395, 20, 380, 200))) {
      int w2[] = {-1};
      mu_layout_row(ctx, 1, w2, 120);
      mu_begin_panel(ctx, "scrollable panel");
      int wp[] = {-1};
      for (int i = 1; i <= 12; i++) {
        mu_layout_row(ctx, 1, wp, 0);
        char line[32];
        snprintf(line, sizeof(line), "Panel row %d", i);
        mu_label(ctx, line);
      }
      mu_end_panel(ctx);
      mu_end_window(ctx);
    }

    // --- Popup demo window ---
    if (mu_begin_window(ctx, "Popup Demo", mu_rect(395, 235, 380, 80))) {
      int w3[] = {-1};
      mu_layout_row(ctx, 1, w3, 0);
      if (mu_button(ctx, "Open popup")) {
        mu_Container *popup = mu_get_container(ctx, "my popup");
        popup->rect = mu_rect(ctx->mouse_pos.x, ctx->mouse_pos.y, 260, 84);
        popup->open = 1;
        ctx->hover_root = ctx->next_hover_root = popup;
        mu_bring_to_front(ctx, popup);
      }
      int popup_opt = MU_OPT_POPUP | MU_OPT_NORESIZE | MU_OPT_NOSCROLL |
                      MU_OPT_NOTITLE | MU_OPT_CLOSED;
      if (mu_begin_window_ex(ctx, "my popup", mu_rect(0, 0, 260, 84),
                             popup_opt)) {
        int wp[] = {-1};
        mu_layout_row(ctx, 1, wp, 0);
        mu_label(ctx, "mu_popup: click outside to close");
        if (mu_button(ctx, "Close")) {
          mu_get_current_container(ctx)->open = 0;
        }
        mu_end_window(ctx);
      }
      mu_end_window(ctx);
    }

    mu_end(ctx);

    if (quit_requested) {
      mfb_close(window);
      break;
    }

    // 4. UI Rendering
    renderer.render(ctx, g_buffer);

    // 5. Display
    mfb_update_state state = mfb_update_ex(window, g_buffer, WIDTH, HEIGHT);
    if (state < 0)
      break;

    // Cap FPS (optional, minifb has built-in sync)
    mfb_wait_sync(window);
  }

  mfb_close(window);
  free(ctx);
  return 0;
}
