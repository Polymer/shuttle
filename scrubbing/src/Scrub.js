/**
 * TODO:
 *   - add easing to snap
 *   - test startDelay
 *   - multiple iterations for input animation
 *   - test CustomEffect
 */
(function(scope) {
  scope = scope || {};
  /* utils */
  var mixinProps = function(inObject, inProps) {
    if (inProps) {
      Object.keys(inProps).forEach(function(key) {
        inObject[key] = inProps[key];
      });
    }
  }

  var invoke = function(inObject, inEventName /* args */) {
    var fn = inObject[inEventName];
    if (fn) {
      var args = Array.prototype.slice.call(arguments, 2);
      fn.apply(inObject.context || window, args);
    }
  }

  var clamp = function(inValue, inMin, inMax) {
    return Math.max(inMin, Math.min(inValue, inMax));
  }
  
  /* Scrubbed Animation */
  scope.Scrub = function(inProps) {
    // fallback to scrubbing x if zooming not available.
    if (inProps.scrubType) {
      if (!('ontouchstart' in window) && (inProps.scrubType == 'zoom')) {
        inProps.scrubType = 'x';
      }
      this.scrubType = inProps.scrubType;
    }
    mixinProps(this, inProps);
    if (!this.snapPoints) {
      this.snapPoints = [];
    }
    if (this.animation) {
      // create a player and pause the animation
      document.timeline.play(this.animation).paused = true;
    } else {
      console.warn('No animation set for scrub');
    }
  };

  scope.Scrub.prototype = {
    scale: 1,
    scrubType: 'x',
    wrap: false,
    nudgeTime: 1e-6,
    get node () {
      return this._node;
    },
    set node(inNode) {
      if (this.node) {
        this.enableEvents(this.node, this.scrubEvents, false);
        this.node.removeAttribute('touch-action');
      }
      this._node = inNode;
      // TODO(sorvell): remove when pointer-events does the right thing.
      var html = document.querySelector('html');
      if (!html.hasAttribute('touch-action')) {
        html.setAttribute('touch-action', 'none');
      }
      this.node.setAttribute('touch-action', 'none');
      if (this.node) {
        this.scrubEvents = [
          {type: 'click', handler: this.click.bind(this)}
        ];
        var moreEvents = [];
        if (this.scrubType == 'zoom') {
          this.scrubProp = 'zoom';
          moreEvents = [
            {type: 'trackstart', handler: this.trackStart.bind(this)},
            {type: 'track', handler: this.track.bind(this)},
            {type: 'trackend', handler: this.trackEnd.bind(this)}
          ];
        } else {
          this.directionProp = this.scrubType + 'Direction';
          this.scrubProp = 'd' + this.scrubType;
          // TODO(sorvell): include flick.
          moreEvents = [
            {type: 'trackstart', handler: this.trackStart.bind(this)},
            {type: 'track', handler: this.track.bind(this)},
            {type: 'trackend', handler: this.trackEnd.bind(this)}
          ];
        }
        this.scrubEvents = this.scrubEvents.concat(moreEvents);
        this.enableEvents(this.node, this.scrubEvents, true);
      }
    },
    enableEvents: function(inNode, inEventInfos, inEnable) {
      var m = inEnable ? 'addEventListener' : 'removeEventListener';
      inEventInfos.forEach(function(info) {
        inNode[m](info.type, info.handler);
      })
    },
    calcDirection: function(e) {
      // note: gesture events don't yet provide direction
      if (this.scrubType == 'zoom') {
        var d = e.zoom == 1 ? 0 : (e.zoom > 1 ? -1 : 1);
        if (this.scrubbing) {
          if (!this.scrubbing.direction) {
            this.scrubbing.direction = d;
          }
          return this.scrubbing.direction;
        } else {
          return d;
        }
      } else {
        return e[this.directionProp];
      }
    },
    calcTimeForEvent: function(e) {
      var dt = e[this.scrubProp] / this.scrubbing.timeScalar;
      if (this.scrubType == 'zoom') {
        var z = (e.zoom - 1) * 0.5;
        dt = Math.max(-1, Math.min(1, z));
      }
      return this.scrubbing.startTime + dt;
    },
    calcSnapPoints: function(inFraction) {
      var snapPoints = [0];
      snapPoints = snapPoints.concat(this.snapPoints || []);
      snapPoints.push(1);
      var sign = inFraction >= 0 ? 1 : -1;
      var p = Math.abs(inFraction), l;
      //console.log('snap', inFraction);
      for (var i=0, l=snapPoints.length, prev=0, snap, s, e; i<l; i++) {
        snap = snapPoints[i];
        if (prev <= p && snap > p) {
          s = sign * prev;
          e = sign * snap;
          return {start: Math.min(s, e), end: Math.max(s, e)};
        }
        prev = snap;
      }
      return {start: snapPoints[0], end: snapPoints[1]};
    },
    canScrub: function(e) {
      return !this.scrubbingStopped && this.calcDirection(e);
    },
    maybeScrub: function(e) {
      if (this.canScrub(e)) {
        this.beginScrub(e);
      }
    },
    beginScrub: function(e) {
      this.scrubEvent = e;
      var d = this.calcDirection(e);
      this.forward = d < 0;
      invoke(this, "onStartScrub", this);
      var length = this.node[this.scrubType == 'y' ? 
          'offsetHeight' : 'offsetWidth'];
      if (!this.scrubbingStopped) {
        this.scrubAnimation();
        this.scrubbing = {
          startTime: this.currentTime,
          timeScalar: length / (this.duration * this.scale)
        }
      }
    },
    trackStart: function(e) {  
      this.resetScrub();
      this.maybeScrub(e);
    },
    track: function(e) {
      if (this.scrubbing) {
        this.currentTime = this.calcTimeForEvent(e);
      } else {
        this.maybeScrub(e);
      }
    },
    trackEnd: function(e) {
      if (this.scrubbing) {
        this.playToSnap(this.calcDirection(e));
        this.resetScrub();
      }
      this.squelchNextClick();
    },
    click: function(e) {
      if (this.scrubClick) {
        if (!this.squelchClick) {
          this.scrubAnimation();
          this.forward = 1;
          this.scrubEvent = e;
          invoke(this, "onStartScrub", this);
          if (!this.scrubbingStopped) {
            this.playTo(3);
          }
          this.resetScrub();
        }
        e.preventDefault();
      }
    },
    squelchNextClick: function() {
      this.squelchClick = true;
      setTimeout(function() {
        this.squelchClick = false;
      }.bind(this), 0);
    },
    stopScrubbing: function() {
      this.scrubbingStopped = true;
      this.scrubbing = null;
    },
    resetScrub: function() {
      this.scrubbing = null;
      this.scrubEvent = null;
      this.scrubbingStopped = false;
    },
    canAnimate: function(inDirection) {
      return this.wrap || (inDirection < 0 && this.currentTime != 0) || 
        (inDirection > 0 && this.currentTime < this.maxTime);
    },
    playToSnap: function(inDirection) {
      this.scrubAnimation();
      if (this.canAnimate(inDirection)) {
        var snaps = this.calcSnapPoints(this.currentTime / this.duration);
        var reversing = (inDirection*this.scale < 0);
        var snap = reversing ? snaps.start : snaps.end;
        this.playTo(snap * this.duration);
      }
    },
    snapNext: function() {
      this.scrubAnimation();
      this.currentTime += this.nudgeTime;
      this.playToSnap(this.scale);
    },
    snapPrevious: function() {
      this.scrubAnimation();
      this.currentTime -= this.nudgeTime;
      this.playToSnap(-this.scale);
    },
    playTo: function(inTime, inDuration) {
      this.scrubAnimation();
      var rate = inDuration ? Math.abs(inTime - t) / inDuration : 1;
      var duration = this.animation.specified.iterationDuration;
      var t = this.currentTime;
      var reversing = (inTime < t);
      if (reversing) {
        this.segment = new SeqGroup([
          new SeqGroup([this.animation], {direction: 'reverse'})
        ], {
          iterationDuration: (duration - inTime),
          playbackRate: rate,
          startDelay: -(duration - t)
        });
      } else {
        this.segment = new SeqGroup([this.animation], {
          iterationDuration: inTime,
          playbackRate: rate,
          startDelay: -t
        });
      }
      document.timeline.play(this.segment);
    },
    scrubAnimation: function() {
      if (this.animation.parent) {
        var reversing = this.animation.parent.specified.direction === 'reverse';
        var segmentDuration = reversing ?
          this.animation.specified.iterationDuration - this.segment.specified.iterationDuration :
          this.segment.specified.iterationDuration;
        // remove animation from segment
        this.animation.remove();
        this.segment.parent && this.segment.remove();
        // reset the animation to the last segment duration
        document.timeline.play(this.animation).paused = true;
        this.currentTime = segmentDuration;
      }
    },
    /*
    addAnimToSegment: function(inDirection, inSnaps) {
      var reversing = (inDirection*this.scale < 0);
      if (reversing != this.segment._reversing) {
        this.segment.reverse();
        // install proper easing
        this.segment.timing.timingFunction = reversing ? 'ease-in' : 'ease-out';
      }
      var start = inSnaps.start * this.duration, end = inSnaps.end * this.duration;
      this.segment.timing.duration = reversing ? this.currentTime - start :
        end - this.currentTime;
      // TODO(sorvell): startDelay calculation for reversing must be understood
      this.animation.timing.startDelay = reversing ? -start : -this.currentTime;
      this.segment.currentTime = 0;
      // TODO(sorvell): bug: must play here to ensure the global tick keeps going
      //console.log('segment duration', this.segment.timing.duration, 'animation delay', this.animation.timing.startDelay);
      document.timeline.play(this.animation);
      this.segment.add(this.animation);
    },
    */
    set currentTime(inTime) {
      var t = inTime;
      if (this.wrap) {
        t = t % this.duration;
        if (t < 0) {
          t = this.duration + t;
        }
      } else {
        t = clamp(t, 0, this.maxTime);
      }
      this.animation.player.currentTime = t;
    },
    get currentTime() {
      // TODO(sorvell): currentTime can drift(?) so make sure not to == duration 
      // or we'll pop over to next iteration.
      return this.wrap ? this.animation.player.currentTime % this.duration : 
        clamp(this.animation.player.currentTime, 0, this.maxTime);
    },
    get duration() {
      return this.animation.iterationDuration;
    },
    get maxTime() {
      return this.duration - (this.wrap ? 0 : this.nudgeTime);
    }
  };
})(window);
