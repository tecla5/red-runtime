var should = require('should');
var util = require('../../src/runtime/util');

describe('red/util', function () {
  describe('normalisePropertyExpression', function () {
      function testABC(input, expected) {
        var result = util.normalisePropertyExpression(input);
        // console.log('+',input);
        // console.log(result);
        result.should.eql(expected);
      }

      function testInvalid(input) {
        /*jshint immed: false */
        (function () {
          util.normalisePropertyExpression(input);
        }).should.throw();
      }
      it('pass a.b.c', function () {
        testABC('a.b.c', ['a', 'b', 'c']);
      })
      it('pass a["b "]["c "]',
        function () {
          testABC('a["b "]["c "]', ['a', 'b', 'c']);
        })
      it('pass a["b "].c',
        function () {
          testABC('a["b "].c', ['a', 'b', 'c']);
        })
      it('pass a["b "].c',
        function () {
          testABC('a["b "].c', ['a', 'b', 'c']);
        })

      it('pass a[0].c', function () {
        testABC('a[0].c', ['a', 0, 'c']);
      })
      it('pass a.0.c', function () {
        testABC('a.0.c', ['a', 0, 'c']);
      })
      it('pass a["a.b[0]"].c',
        function () {
          testABC('a["a.b[0]"].c', ['a', 'a.b[0]', 'c']);
        })
      it('pass a[0][0][0]', function () {
        testABC('a[0][0][0]', ['a', 0, 0, 0]);
      })
      it('pass '
        1.2 .3 .4 '',
        function () {
          testABC(''
            1.2 .3 .4 '', ['1.2.3.4']);
        })
      it('pass '
        a.b '[1]',
        function () {
          testABC(''
            a.b '[1]', ['a.b', 1]);
        })
      it('pass '
        a.b '.c',
        function () {
          testABC(''
            a.b '.c', ['a.b', 'c']);
        })


      it('pass a.$b.c', function () {
        testABC('a.$b.c', ['a', '$b', 'c']);
      })
      it('pass a['
        $b '].c',
        function () {
          testABC('a['
            $b '].c', ['a', '$b', 'c']);
        })
      it('pass a._b.c', function () {
        testABC('a._b.c', ['a', '_b', 'c']);
      })
      it('pass a['
        _b '].c',
        function () {
          testABC('a['
            _b '].c', ['a', '_b', 'c']);
        })

      it('fail a'
        b '.c',
        function () {
          testInvalid('a'
            b '.c');
        })
      it('fail a['
        b '.c',
        function () {
          testInvalid('a['
            b '.c');
        })
      it('fail a[]', function () {
        testInvalid('a[]');
      })
      it('fail a]', function () {
        testInvalid('a]');
      })
      it('fail a[', function () {
        testInvalid('a[');
      })
      it('fail a[0d]', function () {
        testInvalid('a[0d]');
      })
      it('fail a['
        ',function() { testInvalid('
        a['');
      }) it('fail a[']
    ',function() { testInvalid('
    a[']');
  }) it('fail a[0']
',function() { testInvalid('
a[0 ']');
})
it('fail a.[0]', function () {
  testInvalid('a.[0]');
})
it('fail [0]', function () {
  testInvalid('[0]');
})
it('fail a[0', function () {
  testInvalid('a[0');
})
it('fail a.', function () {
  testInvalid('a.');
})
it('fail .a', function () {
  testInvalid('.a');
})
it('fail a. b', function () {
  testInvalid('a. b');
})
it('fail  a.b', function () {
  testInvalid(' a.b');
})
it('fail a[0].[1]', function () {
  testInvalid('a[0].[1]');
})
it('fail a['
  ']',
  function () {
    testInvalid('a['
      ']');
  })
it('fail '
  a.b 'c',
  function () {
    testInvalid(''
      a.b 'c');
  })
it('fail <blank>', function () {
testInvalid('');
})

});
});
