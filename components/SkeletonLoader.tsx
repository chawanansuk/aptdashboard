"use client";

export default function SkeletonLoader() {
  return (
    <div className="ac-skel-wrap">
      <div className="ac-sg">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ac-sc ac-skel-card">
            <div className="ac-skel ac-skel-icon" />
            <div className="ac-sc-body">
              <div className="ac-skel ac-skel-line" style={{ width: "60%" }} />
              <div className="ac-skel ac-skel-line ac-skel-num" />
              <div className="ac-skel ac-skel-line" style={{ width: "40%" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="ac-fs">
        <div className="ac-skel ac-skel-line" style={{ width: 120, height: 18, marginBottom: 12 }} />
        <div className="ac-rg">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="ac-skel ac-skel-room" />
          ))}
        </div>
      </div>
    </div>
  );
}
