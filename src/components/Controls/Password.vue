<script>
import Base from './Base';

export default {
  name: 'Password',
  extends: Base,
  computed: {
    inputType() {
      return 'password';
    }
  }
};
</script>
