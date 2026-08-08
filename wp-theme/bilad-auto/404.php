<?php
/**
 * صفحة 404
 *
 * @package BiladAuto
 */

get_header();
?>

<section class="section error-404">
	<div class="container text-center">
		<h1 class="error-code">404</h1>
		<h2><?php esc_html_e( 'الصفحة غير موجودة', 'bilad-auto' ); ?></h2>
		<p><?php esc_html_e( 'يبدو أن الصفحة التي تبحث عنها انتقلت أو لم تعد موجودة.', 'bilad-auto' ); ?></p>
		<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="btn btn-gold">
			<?php esc_html_e( 'العودة للرئيسية', 'bilad-auto' ); ?>
		</a>
	</div>
</section>

<?php get_footer(); ?>
