<?php
/**
 * قالب المقال المفرد
 *
 * @package BiladAuto
 */

get_header();

while ( have_posts() ) :
	the_post();
	?>

	<header class="page-header">
		<div class="container">
			<h1 class="page-title"><?php the_title(); ?></h1>
			<p class="page-subtitle"><?php echo esc_html( get_the_date() ); ?></p>
		</div>
	</header>

	<section class="section">
		<div class="container">
			<?php if ( has_post_thumbnail() ) : ?>
				<div class="page-featured-img fade-in"><?php the_post_thumbnail( 'full' ); ?></div>
			<?php endif; ?>
			<div class="single-content fade-in">
				<?php the_content(); ?>
			</div>

			<?php
			if ( comments_open() || get_comments_number() ) {
				comments_template();
			}
			?>
		</div>
	</section>

	<?php
endwhile;

get_footer();
