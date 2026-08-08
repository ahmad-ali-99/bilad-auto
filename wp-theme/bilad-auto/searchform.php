<?php
/**
 * نموذج البحث
 *
 * @package BiladAuto
 */
?>
<form role="search" method="get" class="search-form" action="<?php echo esc_url( home_url( '/' ) ); ?>">
	<label class="screen-reader-text" for="search-field"><?php esc_html_e( 'بحث', 'bilad-auto' ); ?></label>
	<input type="search" id="search-field" class="form-input" placeholder="<?php esc_attr_e( 'ابحث...', 'bilad-auto' ); ?>"
	       value="<?php echo esc_attr( get_search_query() ); ?>" name="s">
	<button type="submit" class="btn btn-gold"><?php esc_html_e( 'بحث', 'bilad-auto' ); ?></button>
</form>
