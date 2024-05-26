export const vertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
  }`;

export const fragment = `
  uniform float u_time;
  uniform float u_sin_min;
  uniform float u_sin_base;
  uniform float u_sin_max;
  uniform vec2 u_resolution;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;

  #define MAX_STEPS 120
  #define MAX_DIST 100.0
  #define SURFACE_DIST 0.001

  mat4 rotation3d(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(
      oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
      oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
      oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
      0.0,                                0.0,                                0.0,                                1.0
    );
  }

  vec3 rotate(vec3 v, vec3 axis, float angle) {
    mat4 m = rotation3d(axis, angle);
    return (m * vec4(v, 1.0)).xyz;
  }

  // Tweaked Cosine color palette function from Inigo Quilez
  vec3 getColor(float amount) {
    vec3 color = u_color1 + u_color2 * cos(6.2831 * (u_color3 + vec3(amount)));
    return color * amount;
  }
  
  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
  }

  float sdSphere(vec3 p, float radius) {
      return length(p) - radius;
  }

  float sdSine(vec3 p) {
    return 1.0 - (sin(p.x) + sin(p.y) + sin(p.z))/3.0;
  }

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b-a)/k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float scene(vec3 p) {
    vec3 translate = vec3(pow(sin(u_time / 3.0), 2.0), cos(u_time), 0) / 5.0 - 0.1;
    vec3 p1 = rotate(p + translate, vec3(1.0), u_time * 0.4);
    float box = sdBox(p1, vec3(1.2));

    float scale = u_sin_min + (u_sin_max - u_sin_min) * sin(u_time * 0.2);
    float sine = (u_sin_base - sdSine(p1 * scale))/(scale * 2.0);

    float distance = max(box, sine);

    return distance;
  }

  float raymarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    vec3 color = vec3(0.0);

    for(int i = 0; i < MAX_STEPS; i++) {
      vec3 p = ro + rd * dO;
      float dS = scene(p);

      dO += dS;

      if(dO > MAX_DIST || dS < SURFACE_DIST) {
          break;
      }
    }
    return dO;
  }

  vec3 getNormal(vec3 p) {
    vec2 e = vec2(.01, 0);

    vec3 n = scene(p) - vec3(
      scene(p - e.xyy),
      scene(p - e.yxy),
      scene(p - e.yyx)
    );

    return normalize(n);
  }

  float softShadows(vec3 ro, vec3 rd, float mint, float maxt, float k ) {
    float resultingShadowColor = 1.0;
    float t = mint;
    for(int i = 0; i < 50 && t < maxt; i++) {
        float h = scene(ro + rd*t);
        if( h < 0.001 )
            return 0.0;
        resultingShadowColor = min(resultingShadowColor, k*h/t );
        t += h;
    }
    return resultingShadowColor ;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy/u_resolution.xy;
    uv -= 0.5;
    uv.x *= u_resolution.x / u_resolution.y;

    // Light Position
    vec3 lightPosition = vec3(-10.0, 0.0, 5.0);

    vec3 ro = vec3(0.0, 0.0, 5.0);
    vec3 rd = normalize(vec3(uv, -1.0));

    float d = raymarch(ro, rd);
    vec3 p = ro + rd * d;

    vec3 color = vec3(0.0);

    if (d < MAX_DIST) {
      vec3 normal = getNormal(p);
      vec3 lightDirection = normalize(lightPosition - p);
      
      float diffuse = max(dot(normal, lightDirection), 0.0);
      float shadows = softShadows(p, lightDirection, 0.1, 5.0, 64.0);
      color = vec3(1.5) * getColor(diffuse * shadows);
    }

    gl_FragColor = vec4(color, 1.0);
  }`;
